package app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Validación de tipos y conversión entre el cuerpo JSON, la base de datos y el registro público. */
public final class Support {
    private Support() {}

    public static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> RESERVED = Set.of("id", "created_at", "updated_at");
    private static final Pattern INTEGER = Pattern.compile("^-?\\d+$");
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern TIME = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$");
    private static final Pattern UUID = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", Pattern.CASE_INSENSITIVE);
    public static final Pattern ID = Pattern.compile("^\\d{1,18}$");
    private static final long MAX_SAFE = 9007199254740991L;
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm:ss");

    /** Valores de columnas conocidas (por nombre de columna) y campos adicionales del cuerpo. */
    public record Split(Map<String, Object> values, Map<String, JsonNode> extra) {}

    private static HttpError invalid(Model.Column column, String expected) {
        return new HttpError(400, "El campo \"" + column.name() + "\" debe ser " + expected + ".");
    }

    /** Valida y normaliza un valor según el tipo físico de la columna; lanza 400 si no corresponde. */
    public static Object coerce(Model.Column column, JsonNode node) {
        if (node == null || node.isNull()) return null;
        switch (column.type()) {
            case "string":
                if (!node.isTextual()) throw invalid(column, "texto");
                return node.asText();
            case "integer": {
                Long value = asLong(node);
                if (value == null) throw invalid(column, "un entero");
                return value;
            }
            case "number": {
                Double value = asDouble(node);
                if (value == null) throw invalid(column, "un número");
                return value;
            }
            case "boolean":
                if (node.isTextual() && "true".equals(node.asText())) return Boolean.TRUE;
                if (node.isTextual() && "false".equals(node.asText())) return Boolean.FALSE;
                if (!node.isBoolean()) throw invalid(column, "verdadero o falso");
                return node.booleanValue();
            case "datetime": {
                Instant value = node.isTextual() ? parseInstant(node.asText()) : null;
                if (value == null) throw invalid(column, "una fecha y hora ISO 8601");
                return value;
            }
            case "date":
                if (!node.isTextual() || !DATE.matcher(node.asText()).matches() || !validDate(node.asText())) throw invalid(column, "una fecha AAAA-MM-DD");
                return node.asText();
            case "time":
                if (!node.isTextual() || !TIME.matcher(node.asText()).matches()) throw invalid(column, "una hora HH:MM[:SS]");
                return node.asText();
            case "uuid":
                if (!node.isTextual() || !UUID.matcher(node.asText()).matches()) throw invalid(column, "un UUID");
                return node.asText();
            case "json":
                if (!node.isArray()) throw invalid(column, "una lista");
                return node;
            case "id": {
                String text = node.isIntegralNumber() ? String.valueOf(node.asLong()) : node.isTextual() ? node.asText() : null;
                if (text == null || !ID.matcher(text).matches()) throw invalid(column, "un identificador válido");
                return text;
            }
            default:
                return node;
        }
    }

    private static Long asLong(JsonNode node) {
        if (node.isIntegralNumber() && node.canConvertToLong()) {
            long value = node.longValue();
            return Math.abs(value) <= MAX_SAFE ? value : null;
        }
        if (node.isFloatingPointNumber()) {
            double value = node.doubleValue();
            return value == Math.rint(value) && Math.abs(value) <= MAX_SAFE ? (long) value : null;
        }
        if (node.isTextual() && INTEGER.matcher(node.asText()).matches()) {
            try {
                long value = Long.parseLong(node.asText());
                return Math.abs(value) <= MAX_SAFE ? value : null;
            } catch (NumberFormatException error) {
                return null;
            }
        }
        return null;
    }

    private static Double asDouble(JsonNode node) {
        if (node.isNumber()) return Double.isFinite(node.doubleValue()) ? node.doubleValue() : null;
        if (node.isTextual() && !node.asText().isBlank()) {
            try {
                double value = Double.parseDouble(node.asText().trim());
                return Double.isFinite(value) ? value : null;
            } catch (NumberFormatException error) {
                return null;
            }
        }
        return null;
    }

    private static boolean validDate(String text) {
        try {
            LocalDate.parse(text);
            return true;
        } catch (DateTimeParseException error) {
            return false;
        }
    }

    /** Acepta los formatos ISO 8601 habituales (con o sin zona, o solo fecha); sin zona se entiende UTC. */
    public static Instant parseInstant(String text) {
        try { return Instant.parse(text); } catch (DateTimeParseException ignored) { /* siguiente formato */ }
        try { return OffsetDateTime.parse(text).toInstant(); } catch (DateTimeParseException ignored) { /* siguiente formato */ }
        try { return LocalDateTime.parse(text).toInstant(ZoneOffset.UTC); } catch (DateTimeParseException ignored) { /* siguiente formato */ }
        try { return LocalDate.parse(text).atStartOfDay().toInstant(ZoneOffset.UTC); } catch (DateTimeParseException ignored) { return null; }
    }

    /** Separa el cuerpo en valores de columnas conocidas y campos adicionales. */
    public static Split split(Model.Table table, JsonNode body) {
        if (body == null || !body.isObject()) throw new HttpError(400, "El cuerpo debe ser un objeto");
        Map<String, Object> values = new LinkedHashMap<>();
        Map<String, JsonNode> extra = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> fields = body.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            Model.Column column = table.byName().get(field.getKey());
            if (RESERVED.contains(field.getKey()) && column == null) continue; // gestionados por el sistema
            if (column != null) values.put(column.column(), coerce(column, field.getValue()));
            else extra.put(field.getKey(), field.getValue());
        }
        return new Split(values, extra);
    }

    /** Datos por nombre de campo (columnas conocidas más adicionales), como los ve el motor de reglas. */
    public static Map<String, Object> viewOf(Model.Table table, Map<String, Object> values, Map<String, JsonNode> extra) {
        Map<String, Object> view = new LinkedHashMap<>();
        extra.forEach((key, node) -> view.put(key, plain(node)));
        for (Model.Column column : table.columns()) {
            if (values.containsKey(column.column())) view.put(column.name(), values.get(column.column()));
        }
        return view;
    }

    /** JsonNode a valor Java natural. */
    public static Object plain(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isTextual()) return node.asText();
        if (node.isBoolean()) return node.booleanValue();
        if (node.isIntegralNumber() && node.canConvertToLong()) return node.longValue();
        if (node.isNumber()) return node.doubleValue();
        return node;
    }

    public static Instant toInstant(Object value) {
        if (value == null) return null;
        if (value instanceof Instant instant) return instant;
        if (value instanceof Timestamp timestamp) return timestamp.toInstant();
        if (value instanceof OffsetDateTime offset) return offset.toInstant();
        if (value instanceof LocalDateTime local) return local.toInstant(ZoneOffset.UTC);
        if (value instanceof java.util.Date date) return date.toInstant();
        return parseInstant(String.valueOf(value));
    }

    public static String iso(Object value) {
        Instant instant = toInstant(value);
        return instant == null ? null : ISO.format(instant);
    }

    private static Object fromStorage(Model.Column column, Object value) throws java.io.IOException {
        switch (column.type()) {
            case "integer": return ((Number) value).longValue();
            case "number": return ((Number) value).doubleValue();
            case "boolean": return value instanceof Boolean flag ? flag : ((Number) value).intValue() != 0;
            case "datetime": return iso(value);
            case "date": return value instanceof java.sql.Date date ? date.toLocalDate().toString() : String.valueOf(value).substring(0, 10);
            case "time": return value instanceof java.sql.Time time ? time.toLocalTime().format(TIME_FORMAT) : value instanceof LocalTime local ? local.format(TIME_FORMAT) : String.valueOf(value);
            case "json": return value instanceof JsonNode ? value : JSON.readTree(String.valueOf(value));
            case "id": return String.valueOf(value);
            default: return value instanceof String ? value : String.valueOf(value);
        }
    }

    /** Fila de la base de datos a registro público: { id, capability, data, created_at, updated_at }. */
    public static Map<String, Object> toRecord(Model.Table table, String operation, Map<String, Object> row) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            Object extra = row.get("extra");
            JsonNode extraNode = extra == null ? null : extra instanceof JsonNode node ? node : JSON.readTree(String.valueOf(extra));
            if (extraNode != null && extraNode.isObject()) {
                extraNode.fields().forEachRemaining(entry -> {
                    if (!entry.getValue().isNull()) data.put(entry.getKey(), plain(entry.getValue()));
                });
            }
            for (Model.Column column : table.columns()) {
                Object value = row.get(column.column());
                if (value != null) data.put(column.name(), fromStorage(column, value));
            }
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("id", String.valueOf(row.get("id")));
            record.put("capability", operation);
            record.put("data", data);
            record.put("created_at", iso(row.get("created_at")));
            record.put("updated_at", iso(row.get("updated_at")));
            return record;
        } catch (java.io.IOException error) {
            throw new IllegalStateException("Registro con JSON inválido en la base de datos", error);
        }
    }

    /** El `data` de un registro público, útil como estado anterior en las reglas. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> dataOf(Map<String, Object> record) {
        return (Map<String, Object>) record.get("data");
    }
}
