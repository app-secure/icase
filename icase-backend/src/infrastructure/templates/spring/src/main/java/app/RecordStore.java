package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;

/** Persistencia de los registros de cada operación (tabla por entidad) y de los usuarios del sistema. */
@Component
public class RecordStore {
    private final JdbcTemplate jdbc;
    private final Model model;
    private final RulesEngine rules;
    private final boolean postgres;

    public RecordStore(JdbcTemplate jdbc, Data data, RulesEngine rules) {
        this.jdbc = jdbc;
        this.model = data.model();
        this.rules = rules;
        this.postgres = data.model().postgres();
    }

    private String quote(String name) {
        return postgres ? "\"" + name + "\"" : "`" + name + "`";
    }

    public void ping() {
        jdbc.queryForObject("SELECT 1", Integer.class);
    }

    /** Traduce los errores de integridad de la base de datos a respuestas HTTP comprensibles. */
    private RuntimeException translate(DataAccessException error) {
        Throwable cause = error.getMostSpecificCause();
        if (cause instanceof SQLException sql) {
            String state = sql.getSQLState() == null ? "" : sql.getSQLState();
            int code = sql.getErrorCode();
            if ("23505".equals(state) || code == 1062) return new HttpError(409, "Ya existe un registro con esos valores.");
            if ("23503".equals(state) || code == 1451 || code == 1452) return new HttpError(409, "El registro referencia un dato inexistente o es referenciado por otros registros.");
            if (state.startsWith("22") || code == 1406 || code == 1264 || code == 1292 || code == 1366) return new HttpError(400, "Algún valor no tiene un formato válido.");
        }
        return error;
    }

    /** Convierte el valor validado al tipo que espera el controlador JDBC. */
    private Object bind(Model.Column column, Object value) throws java.io.IOException {
        if (value == null) return null;
        switch (column.type()) {
            case "datetime": return postgres ? Timestamp.from((Instant) value) : LocalDateTime.ofInstant((Instant) value, ZoneOffset.UTC);
            case "date": return java.sql.Date.valueOf(LocalDate.parse((String) value));
            case "time": {
                String text = (String) value;
                return java.sql.Time.valueOf(LocalTime.parse(text.length() == 5 ? text + ":00" : text));
            }
            case "uuid": return postgres ? UUID.fromString((String) value) : value;
            case "json": return Support.JSON.writeValueAsString((JsonNode) value);
            case "id": return Long.valueOf((String) value);
            default: return value;
        }
    }

    private String placeholder(Model.Column column) {
        return postgres && "json".equals(column.type()) ? "?::jsonb" : "?";
    }

    private Model.Column columnOf(Model.Table table, String name) {
        return table.columns().stream().filter(item -> item.column().equals(name)).findFirst().orElse(null);
    }

    public List<Map<String, Object>> list(String operation) {
        Model.Table table = model.tableFor(operation);
        String sql = "SELECT * FROM " + quote(table.name()) + (table.generic() ? " WHERE capability = ?" : "") + " ORDER BY id";
        try {
            List<Map<String, Object>> rows = table.generic() ? jdbc.queryForList(sql, operation) : jdbc.queryForList(sql);
            List<Map<String, Object>> records = new ArrayList<>();
            for (Map<String, Object> row : rows) records.add(Support.toRecord(table, operation, row));
            return records;
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    public Object list(String operation, Integer pageParam, Integer limitParam, String search, Map<String, String> params) {
        boolean hasPaging = pageParam != null || limitParam != null || (search != null && !search.isBlank()) || (params != null && "true".equals(params.get("envelope")));
        if (!hasPaging && (params == null || params.isEmpty())) {
            return list(operation);
        }

        Model.Table table = model.tableFor(operation);
        int page = (pageParam != null && pageParam > 0) ? pageParam : 1;
        int limit = (limitParam != null && limitParam > 0 && limitParam <= 100) ? limitParam : 20;
        int offset = (page - 1) * limit;

        List<String> conditions = new ArrayList<>();
        List<Object> args = new ArrayList<>();

        if (table.generic()) {
            conditions.add("capability = ?");
            args.add(operation);
        }

        if (params != null) {
            for (Model.Column column : table.columns()) {
                String val = params.get(column.name());
                if (val != null && !val.isBlank()) {
                    conditions.add(quote(column.column()) + " = ?");
                    args.add("integer".equals(column.type()) || "number".equals(column.type()) ? Long.valueOf(val) : val);
                }
            }
        }

        if (search != null && !search.isBlank()) {
            String term = "%" + search.trim() + "%";
            List<String> searchClauses = new ArrayList<>();
            for (Model.Column column : table.columns()) {
                if ("string".equals(column.type()) || "date".equals(column.type()) || "uuid".equals(column.type())) {
                    searchClauses.add(postgres ? quote(column.column()) + "::text ILIKE ?" : quote(column.column()) + " LIKE ?");
                    args.add(term);
                }
            }
            searchClauses.add(postgres ? "extra::text ILIKE ?" : "extra LIKE ?");
            args.add(term);
            conditions.add("(" + String.join(" OR ", searchClauses) + ")");
        }

        String whereSql = conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
        String baseSql = "SELECT * FROM " + quote(table.name()) + whereSql + " ORDER BY id";

        try {
            if (!hasPaging) {
                List<Map<String, Object>> rows = args.isEmpty() ? jdbc.queryForList(baseSql) : jdbc.queryForList(baseSql, args.toArray());
                List<Map<String, Object>> records = new ArrayList<>();
                for (Map<String, Object> row : rows) records.add(Support.toRecord(table, operation, row));
                return records;
            }

            String countSql = "SELECT COUNT(*) FROM " + quote(table.name()) + whereSql;
            int total = jdbc.queryForObject(countSql, Integer.class, args.toArray());

            String pagedSql = baseSql + (postgres ? " LIMIT " + limit + " OFFSET " + offset : " LIMIT " + offset + ", " + limit);
            List<Map<String, Object>> rows = jdbc.queryForList(pagedSql, args.toArray());
            List<Map<String, Object>> records = new ArrayList<>();
            for (Map<String, Object> row : rows) records.add(Support.toRecord(table, operation, row));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("data", records);
            Map<String, Object> pagination = new LinkedHashMap<>();
            pagination.put("page", page);
            pagination.put("limit", limit);
            pagination.put("total", total);
            pagination.put("total_pages", Math.max(1, (int) Math.ceil((double) total / limit)));
            result.put("pagination", pagination);
            return result;
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    public Map<String, Object> create(String operation, JsonNode body) {
        Model.Table table = model.tableFor(operation);
        Support.Split split = Support.split(table, rules.prepare(table.name(), body));
        rules.check(table.name(), "create", Support.viewOf(table, split.values(), split.extra()), null);
        Map<String, Object> values = new LinkedHashMap<>(split.values());
        if (table.generic()) values.put("capability", operation);
        List<String> columns = new ArrayList<>(values.keySet());
        List<String> marks = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        try {
            for (String name : columns) {
                Model.Column column = columnOf(table, name);
                marks.add(column == null ? "?" : placeholder(column));
                args.add(column == null ? values.get(name) : bind(column, values.get(name)));
            }
            columns.add("extra");
            marks.add(postgres ? "?::jsonb" : "?");
            args.add(Support.JSON.writeValueAsString(Support.JSON.valueToTree(split.extra())));
            String names = String.join(", ", columns.stream().map(this::quote).toList());
            String sql = "INSERT INTO " + quote(table.name()) + " (" + names + ") VALUES (" + String.join(", ", marks) + ")";
            if (postgres) {
                return Support.toRecord(table, operation, jdbc.queryForList(sql + " RETURNING *", args.toArray()).get(0));
            }
            KeyHolder keys = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                for (int index = 0; index < args.size(); index++) statement.setObject(index + 1, args.get(index));
                return statement;
            }, keys);
            return Support.toRecord(table, operation, row(table, operation, String.valueOf(keys.getKey())));
        } catch (java.io.IOException error) {
            throw new IllegalStateException(error);
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    public Map<String, Object> update(String operation, String id, JsonNode body) {
        Model.Table table = model.tableFor(operation);
        Map<String, Object> current = row(table, operation, id);
        if (current == null) return null;
        Map<String, Object> previous = Support.dataOf(Support.toRecord(table, operation, current));
        Support.Split split = Support.split(table, body);
        Map<String, Object> merged = new LinkedHashMap<>(previous);
        merged.putAll(Support.viewOf(table, split.values(), split.extra()));
        rules.check(table.name(), "update", merged, previous);
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        try {
            for (Map.Entry<String, Object> entry : split.values().entrySet()) {
                Model.Column column = columnOf(table, entry.getKey());
                sets.add(quote(entry.getKey()) + " = " + placeholder(column));
                args.add(bind(column, entry.getValue()));
            }
            sets.add(postgres ? "extra = extra || ?::jsonb" : "extra = JSON_MERGE_PATCH(extra, ?)");
            args.add(Support.JSON.writeValueAsString(Support.JSON.valueToTree(split.extra())));
            if (postgres) sets.add("updated_at = now()");
            args.add(Long.valueOf(id));
            String sql = "UPDATE " + quote(table.name()) + " SET " + String.join(", ", sets) + " WHERE id = ?";
            if (table.generic()) {
                sql += " AND capability = ?";
                args.add(operation);
            }
            jdbc.update(sql, args.toArray());
            return Support.toRecord(table, operation, row(table, operation, id));
        } catch (java.io.IOException error) {
            throw new IllegalStateException(error);
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    public boolean remove(String operation, String id) {
        Model.Table table = model.tableFor(operation);
        if (!Support.ID.matcher(id).matches()) return false;
        try {
            String sql = "DELETE FROM " + quote(table.name()) + " WHERE id = ?" + (table.generic() ? " AND capability = ?" : "");
            int deleted = table.generic() ? jdbc.update(sql, Long.valueOf(id), operation) : jdbc.update(sql, Long.valueOf(id));
            return deleted > 0;
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    private Map<String, Object> row(Model.Table table, String operation, String id) {
        if (!Support.ID.matcher(id).matches()) return null;
        String sql = "SELECT * FROM " + quote(table.name()) + " WHERE id = ?" + (table.generic() ? " AND capability = ?" : "");
        try {
            List<Map<String, Object>> rows = table.generic() ? jdbc.queryForList(sql, Long.valueOf(id), operation) : jdbc.queryForList(sql, Long.valueOf(id));
            return rows.isEmpty() ? null : rows.get(0);
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    // --- Usuarios del sistema (autenticación) ---

    private Map<String, Object> user(Map<String, Object> row) {
        if (row == null) return null;
        Map<String, Object> user = new LinkedHashMap<>(row);
        user.put("id", String.valueOf(row.get("id")));
        Object active = row.get("activo");
        user.put("activo", active instanceof Boolean flag ? flag : active instanceof Number number && number.intValue() != 0);
        user.put("created_at", Support.iso(row.get("created_at")));
        return user;
    }

    public Map<String, Object> findUserByEmail(String email) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM icase_users WHERE email = ?", email);
        return rows.isEmpty() ? null : user(rows.get(0));
    }

    public Map<String, Object> findUserById(String id) {
        if (id == null || !Support.ID.matcher(id).matches()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM icase_users WHERE id = ?", Long.valueOf(id));
        return rows.isEmpty() ? null : user(rows.get(0));
    }

    public List<Map<String, Object>> listUsers() {
        List<Map<String, Object>> users = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT * FROM icase_users ORDER BY id")) users.add(user(row));
        return users;
    }

    public Map<String, Object> createUser(String email, String name, String role, boolean active, String passwordHash) {
        try {
            String sql = "INSERT INTO icase_users (email, nombre, rol, activo, password_hash) VALUES (?, ?, ?, ?, ?)";
            KeyHolder keys = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(sql, new String[] {"id"});
                statement.setString(1, email);
                statement.setString(2, name == null ? "" : name);
                statement.setString(3, role);
                statement.setBoolean(4, active);
                statement.setString(5, passwordHash);
                return statement;
            }, keys);
            return findUserById(String.valueOf(keys.getKey()));
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    public Map<String, Object> updateUser(String id, Map<String, Object> patch) {
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (String field : List.of("email", "nombre", "rol", "activo", "password_hash")) {
            if (patch.containsKey(field)) {
                sets.add(field + " = ?");
                args.add(patch.get(field));
            }
        }
        try {
            if (!sets.isEmpty()) {
                if (postgres) sets.add("updated_at = now()");
                args.add(Long.valueOf(id));
                jdbc.update("UPDATE icase_users SET " + String.join(", ", sets) + " WHERE id = ?", args.toArray());
            }
            return findUserById(id);
        } catch (DataAccessException error) {
            throw translate(error);
        }
    }

    public boolean removeUser(String id) {
        if (!Support.ID.matcher(id).matches()) return false;
        return jdbc.update("DELETE FROM icase_users WHERE id = ?", Long.valueOf(id)) > 0;
    }
}
