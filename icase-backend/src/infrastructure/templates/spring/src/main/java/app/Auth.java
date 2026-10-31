package app;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Autenticación y autorización: JWT HS256, contraseñas con BCrypt, bloqueo por intentos y usuario leído de la base
 * en cada petición (desactivar a alguien o cambiarle el rol surte efecto de inmediato).
 */
@Component
public class Auth {
    private static final List<String> METHODS = List.of("GET", "POST", "PATCH", "DELETE");
    private static final String ADMIN = "administrador";
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern WEAK_SECRET = Pattern.compile("change-?me|replace-?with", Pattern.CASE_INSENSITIVE);
    private static final Pattern OPERATION = Pattern.compile("^/api/operations/([^/]+)");
    private static final Pattern USERS = Pattern.compile("^/api/users(?:/|$)");

    /** Limita intentos por clave dentro de una ventana de tiempo. */
    private static final class Limiter {
        private record Entry(int count, long since) {}

        private final int max;
        private final long windowMillis;
        private final Map<String, Entry> entries = new ConcurrentHashMap<>();

        Limiter(int max, Duration window) {
            this.max = max;
            this.windowMillis = window.toMillis();
        }

        void check(String key) {
            Entry entry = entries.get(key);
            if (entry == null) return;
            if (System.currentTimeMillis() - entry.since() > windowMillis) {
                entries.remove(key);
                return;
            }
            if (entry.count() >= max) throw new HttpError(429, "Demasiados intentos. Inténtalo de nuevo más tarde.");
        }

        void fail(String key) {
            long now = System.currentTimeMillis();
            entries.merge(key, new Entry(1, now), (current, fresh) -> now - current.since() <= windowMillis ? new Entry(current.count() + 1, current.since()) : fresh);
            if (entries.size() > 5000) entries.entrySet().removeIf(item -> now - item.getValue().since() > windowMillis);
        }

        void reset(String key) {
            entries.remove(key);
        }
    }

    private final RecordStore store;
    private final JsonNode policy;
    private final boolean enabled;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final Limiter logins = new Limiter(5, Duration.ofMinutes(15));
    private final Limiter registrations = new Limiter(10, Duration.ofMinutes(15));
    private final String dummyHash = encoder.encode(UUID.randomUUID().toString());

    public Auth(RecordStore store, Data data) {
        this.store = store;
        this.policy = data.policy();
        this.enabled = data.authEnabled();
    }

    public boolean enabled() {
        return enabled;
    }

    private static String lower(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private static HttpError bad(String message) {
        return new HttpError(400, message);
    }

    private static String text(JsonNode body, String field) {
        JsonNode node = body == null ? null : body.get(field);
        return node != null && node.isTextual() ? node.asText() : null;
    }

    private boolean knownRole(String role) {
        return ADMIN.equals(role) || policy.path("roles").has(role);
    }

    /** Valida correo, contraseña y nombre; en modo parcial solo valida lo que viene. */
    private Map<String, String> credentials(JsonNode body, boolean partial) {
        Map<String, String> result = new LinkedHashMap<>();
        boolean hasEmail = body.has("email");
        boolean hasPassword = body.has("password");
        if (!partial || hasEmail) {
            String email = lower(text(body, "email"));
            if (!EMAIL.matcher(email).matches() || email.length() > 254) throw bad("El correo electrónico no es válido.");
            result.put("email", email);
        }
        if (!partial || hasPassword) {
            String password = text(body, "password");
            if (password == null || password.length() < 8 || password.length() > 128) throw bad("La contraseña debe tener entre 8 y 128 caracteres.");
            result.put("password", password);
        }
        if (body.has("nombre")) {
            String name = body.get("nombre").isTextual() ? body.get("nombre").asText().trim() : String.valueOf(body.get("nombre").asText()).trim();
            if (name.length() > 120) throw bad("El nombre no puede superar 120 caracteres.");
            result.put("nombre", name);
        }
        return result;
    }

    /**
     * Comprueba el secreto de los tokens al construir el componente, antes de que el servidor web empiece a escuchar:
     * con un secreto ausente o débil en producción la aplicación no llega a aceptar peticiones.
     */
    @PostConstruct
    void validateConfiguration() {
        if (!enabled) return;
        String secret = System.getenv("JWT_SECRET");
        if (secret == null || secret.isBlank()) throw new IllegalStateException("JWT_SECRET no está definido.");
        if ("production".equals(System.getenv("APP_ENV")) && (secret.length() < 16 || WEAK_SECRET.matcher(secret).find())) {
            throw new IllegalStateException("JWT_SECRET es inseguro: usa un valor aleatorio de al menos 16 caracteres.");
        }
    }

    /** Crea el administrador inicial. Se llama una vez, ya migrada la base de datos. */
    public void init() {
        if (!enabled) return;
        String email = System.getenv("ADMIN_EMAIL");
        String password = System.getenv("ADMIN_PASSWORD");
        if (email == null || password == null || email.isBlank() || password.isBlank()) {
            System.err.println("ADMIN_EMAIL y ADMIN_PASSWORD no están definidos: no se creó el administrador inicial.");
            return;
        }
        Map<String, String> admin = credentials(Support.JSON.createObjectNode().put("email", email).put("password", password), false);
        if (store.findUserByEmail(admin.get("email")) != null) return;
        try {
            store.createUser(admin.get("email"), "Administrador", ADMIN, true, encoder.encode(admin.get("password")));
        } catch (HttpError error) {
            if (error.status() != 409) throw error; // otra instancia lo creó primero
        }
    }

    private String issue(Map<String, Object> user) {
        return JWT.create()
            .withSubject(String.valueOf(user.get("id")))
            .withClaim("rol", String.valueOf(user.get("rol")))
            .withExpiresAt(Instant.now().plus(expiration()))
            .sign(Algorithm.HMAC256(System.getenv("JWT_SECRET")));
    }

    private Duration expiration() {
        String value = policy.path("expiracion").asText("8h");
        long amount = Long.parseLong(value.substring(0, value.length() - 1));
        return value.endsWith("d") ? Duration.ofDays(amount) : value.endsWith("h") ? Duration.ofHours(amount) : Duration.ofMinutes(amount);
    }

    public Map<String, Object> publicUser(Map<String, Object> user) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", String.valueOf(user.get("id")));
        result.put("email", user.get("email"));
        result.put("nombre", user.get("nombre"));
        result.put("rol", user.get("rol"));
        result.put("activo", !Boolean.FALSE.equals(user.get("activo")));
        result.put("created_at", user.get("created_at"));
        return result;
    }

    public Map<String, Object> permissionsOf(Map<String, Object> user) {
        boolean admin = ADMIN.equals(user.get("rol"));
        Map<String, Object> operations = new LinkedHashMap<>();
        policy.path("operaciones").fields().forEachRemaining(entry -> {
            List<String> methods = new ArrayList<>();
            if (admin) methods.addAll(METHODS);
            else entry.getValue().path(String.valueOf(user.get("rol"))).forEach(method -> methods.add(method.asText()));
            if (!methods.isEmpty()) operations.put(entry.getKey(), methods);
        });
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rol", user.get("rol"));
        result.put("nombre_rol", admin ? "Administrador" : policy.path("roles").path(String.valueOf(user.get("rol"))).path("nombre").asText(String.valueOf(user.get("rol"))));
        result.put("administrador", admin);
        result.put("operaciones", operations);
        return result;
    }

    public Map<String, Object> login(JsonNode body, String ip) {
        String email = text(body, "email");
        String password = text(body, "password");
        if (email == null || password == null) throw bad("Indica correo electrónico y contraseña.");
        String key = lower(email) + "|" + ip;
        logins.check(key);
        Map<String, Object> user = store.findUserByEmail(lower(email));
        // Se verifica siempre un hash para que el tiempo de respuesta no revele si el correo existe.
        boolean valid = encoder.matches(password, user == null ? dummyHash : String.valueOf(user.get("password_hash")));
        if (user == null || !valid || Boolean.FALSE.equals(user.get("activo"))) {
            logins.fail(key);
            throw new HttpError(401, "Credenciales inválidas.");
        }
        logins.reset(key);
        Map<String, Object> session = new LinkedHashMap<>();
        session.put("token", issue(user));
        session.put("usuario", publicUser(user));
        session.put("permisos", permissionsOf(user));
        return session;
    }

    public Map<String, Object> register(JsonNode body, String ip) {
        List<String> open = new ArrayList<>();
        policy.path("roles").fields().forEachRemaining(entry -> {
            if (entry.getValue().path("autoregistro").asBoolean(false)) open.add(entry.getKey());
        });
        if (open.isEmpty()) throw new HttpError(403, "El registro abierto no está habilitado.");
        registrations.check("register|" + ip);
        registrations.fail("register|" + ip);
        JsonNode input = body != null && body.isObject() ? body : Support.JSON.createObjectNode();
        String requested = input.has("rol") && input.get("rol").isTextual() ? lower(input.get("rol").asText()) : "";
        String role = !input.has("rol") && open.size() == 1 ? open.get(0) : requested;
        if (!open.contains(role)) throw bad("El rol debe ser uno de: " + String.join(", ", open) + ".");
        Map<String, String> data = credentials(input, false);
        Map<String, Object> created = store.createUser(data.get("email"), data.getOrDefault("nombre", ""), role, true, encoder.encode(data.get("password")));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("usuario", publicUser(created));
        return result;
    }

    /** Usuario de la sesión según la cabecera Authorization; 401 si falta, es inválida o el usuario ya no está activo. */
    public Map<String, Object> authenticate(String header) {
        if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7) || header.substring(7).isBlank() || header.substring(7).contains(" ")) {
            throw new HttpError(401, "Autenticación requerida.");
        }
        DecodedJWT decoded;
        try {
            decoded = JWT.require(Algorithm.HMAC256(System.getenv("JWT_SECRET"))).build().verify(header.substring(7).trim());
        } catch (JWTVerificationException error) {
            throw new HttpError(401, "Sesión inválida o expirada.");
        }
        Map<String, Object> user = store.findUserById(decoded.getSubject());
        if (user == null || Boolean.FALSE.equals(user.get("activo"))) throw new HttpError(401, "Sesión inválida o expirada.");
        return user;
    }

    public boolean isPublic(String method, String path) {
        return ("GET".equals(method) && "/health".equals(path))
            || ("POST".equals(method) && ("/api/auth/login".equals(path) || "/api/auth/register".equals(path)));
    }

    public void authorize(Map<String, Object> user, String method, String path) {
        java.util.regex.Matcher operation = OPERATION.matcher(path);
        boolean admin = ADMIN.equals(user.get("rol"));
        if (operation.find()) {
            JsonNode byRole = policy.path("operaciones").get(operation.group(1));
            if (byRole == null) return; // operación inexistente: responde 404 la ruta
            boolean allowed = admin;
            for (JsonNode allowedMethod : byRole.path(String.valueOf(user.get("rol")))) allowed = allowed || allowedMethod.asText().equals(method);
            if (!allowed) throw new HttpError(403, "No tienes permiso para esta operación.");
            return;
        }
        if (USERS.matcher(path).find() && !admin) throw new HttpError(403, "Solo el administrador gestiona usuarios.");
    }

    // --- Gestión de usuarios (solo administrador) ---

    public List<Map<String, Object>> listUsers() {
        List<Map<String, Object>> users = new ArrayList<>();
        for (Map<String, Object> user : store.listUsers()) users.add(publicUser(user));
        return users;
    }

    public Map<String, Object> createUser(JsonNode body) {
        JsonNode input = body != null && body.isObject() ? body : Support.JSON.createObjectNode();
        Map<String, String> data = credentials(input, false);
        String role = input.has("rol") && input.get("rol").isTextual() ? lower(input.get("rol").asText()) : "";
        if (!knownRole(role)) throw bad("El rol debe ser uno de: " + ADMIN + (policy.path("roles").size() > 0 ? ", " : "") + String.join(", ", roleNames()) + ".");
        boolean active = !(input.has("activo") && input.get("activo").isBoolean() && !input.get("activo").booleanValue());
        return publicUser(store.createUser(data.get("email"), data.getOrDefault("nombre", ""), role, active, encoder.encode(data.get("password"))));
    }

    private List<String> roleNames() {
        List<String> names = new ArrayList<>();
        policy.path("roles").fieldNames().forEachRemaining(names::add);
        return names;
    }

    public Map<String, Object> updateUser(String id, JsonNode body) {
        Map<String, Object> current = store.findUserById(id);
        if (current == null) return null;
        JsonNode input = body != null && body.isObject() ? body : Support.JSON.createObjectNode();
        Map<String, String> data = credentials(input, true);
        Map<String, Object> patch = new LinkedHashMap<>();
        if (data.containsKey("email")) patch.put("email", data.get("email"));
        if (data.containsKey("nombre")) patch.put("nombre", data.get("nombre"));
        if (data.containsKey("password")) patch.put("password_hash", encoder.encode(data.get("password")));
        if (input.has("rol")) {
            String role = input.get("rol").isTextual() ? lower(input.get("rol").asText()) : "";
            if (!knownRole(role)) throw bad("El rol no existe.");
            patch.put("rol", role);
        }
        if (input.has("activo")) {
            if (!input.get("activo").isBoolean()) throw bad("\"activo\" debe ser verdadero o falso.");
            patch.put("activo", input.get("activo").booleanValue());
        }
        boolean losesAdmin = ADMIN.equals(current.get("rol")) && !Boolean.FALSE.equals(current.get("activo"))
            && ((patch.containsKey("rol") && !ADMIN.equals(patch.get("rol"))) || Boolean.FALSE.equals(patch.get("activo")));
        if (losesAdmin) keepAnotherAdmin(String.valueOf(current.get("id")));
        return publicUser(store.updateUser(String.valueOf(current.get("id")), patch));
    }

    public boolean removeUser(String id, Map<String, Object> actor) {
        Map<String, Object> current = store.findUserById(id);
        if (current == null) return false;
        if (actor != null && String.valueOf(actor.get("id")).equals(String.valueOf(current.get("id")))) throw bad("No puedes eliminar tu propio usuario.");
        if (ADMIN.equals(current.get("rol")) && !Boolean.FALSE.equals(current.get("activo"))) keepAnotherAdmin(String.valueOf(current.get("id")));
        return store.removeUser(String.valueOf(current.get("id")));
    }

    private void keepAnotherAdmin(String excludedId) {
        boolean other = store.listUsers().stream().anyMatch(user -> !String.valueOf(user.get("id")).equals(excludedId)
            && ADMIN.equals(user.get("rol")) && !Boolean.FALSE.equals(user.get("activo")));
        if (!other) throw new HttpError(409, "Debe existir al menos un administrador activo.");
    }
}
