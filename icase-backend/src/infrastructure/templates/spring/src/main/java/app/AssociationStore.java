package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.*;
import java.util.*;
import javax.sql.DataSource;
import org.springframework.stereotype.Component;

/** Vínculos SQL transaccionales: los identificadores físicos proceden solo del modelo aprobado. */
@Component
public class AssociationStore {
    private final DataSource source;
    private final Model model;
    public AssociationStore(DataSource source, Data data) { this.source = source; this.model = data.model(); }
    private String quote(String name) {
        if (!name.matches("[a-zA-Z_][a-zA-Z0-9_]*")) throw new IllegalStateException("Identificador físico inválido");
        return model.postgres() ? "\"" + name + "\"" : "`" + name + "`";
    }
    private long id(JsonNode value) {
        if (value == null || !value.isTextual() || !value.asText().matches("[1-9][0-9]{0,18}")) throw new HttpError(400, "Identificador inválido. Usa una cadena de entero positivo.");
        try { return Long.parseLong(value.asText()); }
        catch (NumberFormatException error) { throw new HttpError(400, "Identificador fuera de rango."); }
    }
    private void lock(Connection connection, String table, long id) throws SQLException {
        String sql = "SELECT id FROM " + quote(table) + " WHERE id = ? " + (model.postgres() ? "FOR SHARE" : "LOCK IN SHARE MODE");
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, id);
            try (ResultSet rows = statement.executeQuery()) { if (!rows.next()) throw new HttpError(404, "Uno de los extremos del vínculo no existe."); }
        }
    }
    private void assertOwned(Connection connection, String table, long id, String ownerScope) throws SQLException {
        if (ownerScope == null || !model.hasOwnerColumn(table)) return;
        String sql = "SELECT id FROM " + quote(table) + " WHERE id = ? AND " + quote("owner_id") + " = ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, id);
            statement.setLong(2, Long.parseLong(ownerScope));
            try (ResultSet rows = statement.executeQuery()) {
                if (!rows.next()) throw new HttpError(404, "Uno de los extremos del vínculo no existe.");
            }
        }
    }
    private boolean owned(Connection connection, String table, long id, String ownerScope) throws SQLException {
        if (ownerScope == null || !model.hasOwnerColumn(table)) return true;
        String sql = "SELECT id FROM " + quote(table) + " WHERE id = ? AND " + quote("owner_id") + " = ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, id);
            statement.setLong(2, Long.parseLong(ownerScope));
            try (ResultSet rows = statement.executeQuery()) { return rows.next(); }
        }
    }
    public Object run(String action, String name, JsonNode input) {
        return run(action, name, input, null, null);
    }
    public Object run(String action, String name, JsonNode input, String sourceOwner, String targetOwner) {
        Model.Association relation = model.association(name);
        boolean list = "list".equals(action);
        if (!list && !"link".equals(action) && !"unlink".equals(action)) throw new HttpError(400, "Acción inválida.");
        if (input == null || !input.isObject()) throw new HttpError(400, "Datos de vínculo inválidos.");
        Set<String> allowed = list ? Set.of("source_id", "limit", "after_target_id") : Set.of("source_id", "target_id");
        input.fieldNames().forEachRemaining(field -> { if (!allowed.contains(field)) throw new HttpError(400, "Campo de vínculo inválido."); });
        long from = id(input.get("source_id"));
        long to = list ? 0 : id(input.get("target_id"));
        Long after = list && input.has("after_target_id") ? id(input.get("after_target_id")) : null;
        int limit = 50;
        if (list && input.has("limit")) {
            String value = input.get("limit").asText();
            if (!value.matches("[0-9]{1,3}")) throw new HttpError(400, "Límite inválido (1 a 100).");
            limit = Integer.parseInt(value);
            if (limit < 1 || limit > 100) throw new HttpError(400, "Límite inválido (1 a 100).");
        }
        try (Connection connection = source.getConnection()) {
            connection.setAutoCommit(false);
            try {
                // Orden estable de bloqueos para ambas orientaciones de una autorrelación.
                boolean sourceFirst = list || relation.source().compareTo(relation.target()) < 0 || (relation.source().equals(relation.target()) && from <= to);
                if (!list && !sourceFirst) lock(connection, relation.target(), to);
                lock(connection, relation.source(), from);
                if (!list && sourceFirst) lock(connection, relation.target(), to);
                assertOwned(connection, relation.source(), from, sourceOwner);
                if (!list) assertOwned(connection, relation.target(), to, targetOwner);
                Object result;
                if (list) {
                    List<Map<String, String>> items = new ArrayList<>();
                    Long cursor = after;
                    boolean hasMore = false;
                    while (items.size() < limit) {
                        int batch = Math.min(100, limit - items.size() + 1);
                        String sql = "SELECT source_id, target_id FROM " + quote(name) + " WHERE source_id = ?" + (cursor == null ? "" : " AND target_id > ?") + " ORDER BY target_id LIMIT ?";
                        List<Map<String, String>> rows = new ArrayList<>();
                        try (PreparedStatement statement = connection.prepareStatement(sql)) {
                            statement.setLong(1, from);
                            if (cursor != null) statement.setLong(2, cursor);
                            statement.setInt(cursor == null ? 2 : 3, batch);
                            try (ResultSet resultSet = statement.executeQuery()) {
                                while (resultSet.next()) rows.add(Map.of("source_id", resultSet.getString("source_id"), "target_id", resultSet.getString("target_id")));
                            }
                        }
                        if (rows.isEmpty()) break;
                        for (Map<String, String> row : rows) {
                            long targetId = Long.parseLong(row.get("target_id"));
                            if (!owned(connection, relation.target(), targetId, targetOwner)) continue;
                            items.add(row);
                            if (items.size() == limit) { hasMore = true; break; }
                        }
                        cursor = Long.parseLong(rows.get(rows.size() - 1).get("target_id"));
                        if (rows.size() < batch) { hasMore = false; break; }
                        if (items.size() == limit) break;
                    }
                    result = Map.of("data", items, "has_more", hasMore);
                } else {
                    String sql = "link".equals(action)
                        ? "INSERT INTO " + quote(name) + " (source_id, target_id, extra) VALUES (?, ?, " + (model.postgres() ? "'{}'::jsonb" : "'{}'") + ") " + (model.postgres() ? "ON CONFLICT (source_id, target_id) DO NOTHING" : "ON DUPLICATE KEY UPDATE source_id = VALUES(source_id)")
                        : "DELETE FROM " + quote(name) + " WHERE source_id = ? AND target_id = ?";
                    try (PreparedStatement statement = connection.prepareStatement(sql)) {
                        statement.setLong(1, from); statement.setLong(2, to); statement.executeUpdate();
                    }
                    result = Map.of("source_id", Long.toString(from), "target_id", Long.toString(to), "associated", "link".equals(action));
                }
                connection.commit();
                return result;
            } catch (RuntimeException | SQLException error) {
                try { connection.rollback(); } catch (SQLException rollback) { error.addSuppressed(rollback); }
                throw error;
            }
        } catch (SQLException error) {
            if ("23503".equals(error.getSQLState()) || error.getErrorCode() == 1451 || error.getErrorCode() == 1452) throw new HttpError(409, "El vínculo referencia un registro inexistente.");
            throw new IllegalStateException("No se pudo completar la operación de vínculos.", error);
        }
    }
}
