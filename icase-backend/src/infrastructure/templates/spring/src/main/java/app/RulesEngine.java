package app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Aplica de forma determinista las reglas de negocio confirmadas (icase/rules.json). */
@Component
public class RulesEngine {
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern DATE_PREFIX = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}.*");

    private final JsonNode rules;

    public RulesEngine(Data data) {
        this.rules = data.rules();
    }

    private static boolean present(Object value) {
        if (value == null) return false;
        if (value instanceof JsonNode node) return !node.isNull() && !(node.isTextual() && node.asText().isEmpty());
        return !(value instanceof String text && text.isEmpty());
    }

    private static boolean present(JsonNode node) {
        return node != null && !node.isNull() && !(node.isTextual() && node.asText().isEmpty());
    }

    /** Lleva fechas, números y textos a un valor comparable; null si no hay valor. */
    private static Object comparable(Object value) {
        if (!present(value)) return null;
        if (value instanceof Instant instant) return (double) instant.toEpochMilli();
        if (value instanceof Number number) return number.doubleValue();
        if (value instanceof JsonNode node) {
            if (node.isNumber()) return node.doubleValue();
            if (node.isTextual()) return comparable(node.asText());
            return node.toString();
        }
        if (value instanceof String text && DATE_PREFIX.matcher(text).matches()) {
            Instant instant = Support.parseInstant(text);
            if (instant != null) return (double) instant.toEpochMilli();
        }
        return value;
    }

    /** Valores por defecto y estado inicial: se aplican al crear, antes de validar. */
    public JsonNode prepare(String table, JsonNode body) {
        if (body == null || !body.isObject()) return body;
        ObjectNode result = ((ObjectNode) body).deepCopy();
        for (JsonNode rule : rules.path(table)) {
            String field = rule.path("campo").asText();
            if ("valor_por_defecto".equals(rule.path("tipo").asText()) && !present(result.get(field))) result.set(field, rule.get("valor"));
            if ("maquina_estados".equals(rule.path("tipo").asText()) && !present(result.get(field))) result.set(field, rule.get("inicial"));
        }
        return result;
    }

    /** Valida el estado resultante de una operación; lanza 422 con el detalle de las reglas incumplidas. */
    public void check(String table, String mode, Map<String, Object> next, Map<String, Object> previous) {
        List<Map<String, Object>> violations = new ArrayList<>();
        for (JsonNode rule : rules.path(table)) {
            String field = rule.path("campo").asText();
            Object value = next.get(field);
            switch (rule.path("tipo").asText()) {
                case "requerido" -> {
                    if (!present(value)) violations.add(violation(rule, null));
                }
                case "rango" -> {
                    Object number = comparable(value);
                    if (number == null) break;
                    if (!(number instanceof Double current)
                        || (rule.has("min") && current < rule.get("min").asDouble())
                        || (rule.has("max") && current > rule.get("max").asDouble())) violations.add(violation(rule, null));
                }
                case "longitud" -> {
                    if (present(value)) {
                        String text = value instanceof String string ? string : null;
                        if (text == null || (rule.has("min") && text.length() < rule.get("min").asInt())
                            || (rule.has("max") && text.length() > rule.get("max").asInt())) violations.add(violation(rule, null));
                    }
                }
                case "formato" -> {
                    if (present(value) && !(value instanceof String text && ("email".equals(rule.path("formato").asText()) ? EMAIL.matcher(text).matches() : validUrl(text)))) {
                        violations.add(violation(rule, null));
                    }
                }
                case "comparacion" -> {
                    Object left = comparable(value);
                    Object right = comparable(rule.has("con_campo") ? next.get(rule.get("con_campo").asText()) : Support.plain(rule.get("con_valor")));
                    if (left == null || right == null) break;
                    if (left.getClass() != right.getClass() || !compare(rule.path("operador").asText(), left, right)) violations.add(violation(rule, null));
                }
                case "maquina_estados" -> {
                    if (!present(value)) break;
                    if ("create".equals(mode)) {
                        if (!Objects.equals(value, rule.path("inicial").asText())) violations.add(violation(rule, null));
                    } else if (previous != null && present(previous.get(field)) && !Objects.equals(previous.get(field), value) && !transitionAllowed(rule, previous.get(field), value)) {
                        violations.add(violation(rule, " (" + previous.get(field) + " → " + value + ")"));
                    }
                }
                case "inmutable" -> {
                    if ("update".equals(mode) && previous != null && present(previous.get(field)) && !Objects.equals(comparable(previous.get(field)), comparable(value))) violations.add(violation(rule, null));
                }
                default -> { /* 'unico' lo garantiza la base de datos; 'valor_por_defecto' se aplica en prepare() */ }
            }
        }
        if (!violations.isEmpty()) {
            StringBuilder message = new StringBuilder("Se incumplen reglas de negocio:");
            for (Map<String, Object> violation : violations) message.append(' ').append(violation.get("mensaje"));
            throw new HttpError(422, message.toString(), violations);
        }
    }

    private static boolean transitionAllowed(JsonNode rule, Object from, Object to) {
        for (JsonNode transition : rule.path("transiciones")) {
            if (Objects.equals(transition.path("de").asText(), from) && Objects.equals(transition.path("a").asText(), to)) return true;
        }
        return false;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static boolean compare(String operator, Object left, Object right) {
        if (left instanceof Double a && right instanceof Double b) {
            int order = Double.compare(a, b);
            return switch (operator) {
                case "<" -> order < 0;
                case "<=" -> order <= 0;
                case ">" -> order > 0;
                case ">=" -> order >= 0;
                case "==" -> order == 0;
                case "!=" -> order != 0;
                default -> false;
            };
        }
        return switch (operator) {
            case "==" -> Objects.equals(left, right);
            case "!=" -> !Objects.equals(left, right);
            default -> false;
        };
    }

    private static boolean validUrl(String text) {
        try {
            URI uri = new URI(text);
            return uri.getHost() != null && ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()));
        } catch (java.net.URISyntaxException error) {
            return false;
        }
    }

    private static Map<String, Object> violation(JsonNode rule, String suffix) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("regla", rule.path("id").asText());
        result.put("mensaje", rule.path("mensaje").asText() + (suffix == null ? "" : suffix));
        result.put("rf", rule.path("rf"));
        return result;
    }
}
