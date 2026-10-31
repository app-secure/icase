package app;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Sesión y gestión de usuarios. Sin autenticación aprobada estas rutas no existen (404). */
@RestController
public class AuthController {
    private final Auth auth;

    public AuthController(Auth auth) {
        this.auth = auth;
    }

    private void required() {
        if (!auth.enabled()) throw new HttpError(404, "Ruta inexistente");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> user(HttpServletRequest request) {
        return (Map<String, Object>) request.getAttribute(AuthFilter.USER);
    }

    @PostMapping("/api/auth/login")
    public Map<String, Object> login(@RequestBody(required = false) JsonNode body, HttpServletRequest request) {
        required();
        return auth.login(body, request.getRemoteAddr());
    }

    @PostMapping("/api/auth/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody(required = false) JsonNode body, HttpServletRequest request) {
        required();
        return ResponseEntity.status(HttpStatus.CREATED).body(auth.register(body, request.getRemoteAddr()));
    }

    @GetMapping("/api/auth/me")
    public Map<String, Object> me(HttpServletRequest request) {
        required();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("usuario", auth.publicUser(user(request)));
        result.put("permisos", auth.permissionsOf(user(request)));
        return result;
    }

    @GetMapping("/api/users")
    public List<Map<String, Object>> users() {
        required();
        return auth.listUsers();
    }

    @PostMapping("/api/users")
    public ResponseEntity<Map<String, Object>> createUser(@RequestBody(required = false) JsonNode body) {
        required();
        return ResponseEntity.status(HttpStatus.CREATED).body(auth.createUser(body));
    }

    @PatchMapping("/api/users/{id}")
    public Map<String, Object> updateUser(@PathVariable String id, @RequestBody(required = false) JsonNode body) {
        required();
        Map<String, Object> updated = auth.updateUser(id, body);
        if (updated == null) throw new HttpError(404, "Usuario inexistente");
        return updated;
    }

    @DeleteMapping("/api/users/{id}")
    public Map<String, Object> deleteUser(@PathVariable String id, HttpServletRequest request) {
        required();
        if (!auth.removeUser(id, user(request))) throw new HttpError(404, "Usuario inexistente");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deleted", true);
        result.put("id", id);
        return result;
    }
}
