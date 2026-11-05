package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Modelo físico del backend, leído de icase/model.json. */
public final class Model {
    /** Columna de una tabla: `name` es el atributo de la API y `column` el nombre en la base de datos. */
    public record Column(String name, String column, String type, boolean internal) {}

    public record Table(String name, String entity, boolean generic, List<Column> columns, Map<String, Column> byName) {}

    private final String database;
    private final Map<String, String> operations = new LinkedHashMap<>();
    private final Map<String, Table> tables = new LinkedHashMap<>();
    public record Association(String name, String source, String target) {}
    private final Map<String, Association> associations = new LinkedHashMap<>();

    public Model(JsonNode model) {
        this.database = model.path("database").asText("postgres");
        for (JsonNode relation : model.path("associations")) {
            String name = relation.path("table").asText();
            JsonNode columns = model.path("tables").path(name).path("columns");
            associations.put(name, new Association(name, columns.path(0).path("references").asText(), columns.path(1).path("references").asText()));
        }
        model.path("operations").fields().forEachRemaining(entry -> operations.put(entry.getKey(), entry.getValue().asText()));
        model.path("tables").fields().forEachRemaining(entry -> {
            JsonNode table = entry.getValue();
            List<Column> columns = new ArrayList<>();
            Map<String, Column> byName = new LinkedHashMap<>();
            for (JsonNode node : table.path("columns")) {
                Column column = new Column(node.path("name").asText(), node.path("column").asText(), node.path("type").asText(), node.path("internal").asBoolean(false));
                columns.add(column);
                byName.put(column.name(), column);
            }
            tables.put(entry.getKey(), new Table(entry.getKey(), table.path("entity").isNull() ? null : table.path("entity").asText(null),
                table.path("generic").asBoolean(false), columns, byName));
        });
    }

    public String database() {
        return database;
    }
    public Association association(String name) {
        Association relation = associations.get(name);
        if (relation == null) throw new HttpError(404, "Relación inexistente.");
        return relation;
    }

    public boolean postgres() {
        return "postgres".equals(database);
    }

    /** Tabla que gestiona una operación; 404 si la operación no existe. */
    public Table tableFor(String operation) {
        String name = operations.get(operation);
        if (name == null) throw new HttpError(404, "Operación inexistente");
        return tables.get(name);
    }

    public List<String> operationsForTable(String tableName) {
        List<String> keys = new ArrayList<>();
        for (Map.Entry<String, String> entry : operations.entrySet()) {
            if (tableName.equals(entry.getValue())) keys.add(entry.getKey());
        }
        return keys;
    }

    public boolean hasOwnerColumn(String tableName) {
        Table table = tables.get(tableName);
        if (table == null) return false;
        return table.columns().stream().anyMatch(column -> "owner_id".equals(column.column()));
    }
}
