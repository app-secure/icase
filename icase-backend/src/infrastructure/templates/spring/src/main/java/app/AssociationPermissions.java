package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;

public final class AssociationPermissions {
    private AssociationPermissions() {}
    public static void check(JsonNode policy, JsonNode contract, Map<String, Object> user, String method, String key) {
        JsonNode found = null;
        for (JsonNode item : contract.path("associations")) if (key.equals(item.path("table").asText())) { found = item; break; }
        if (found == null) throw new HttpError(404, "Relación inexistente.");
        if ("administrador".equals(user.get("rol"))) return;
        List<String> required = "GET".equals(method) ? List.of("GET") : List.of("GET", "PATCH");
        JsonNode endpoints = found.path("operations");
        if (endpoints.size() != 2) throw new HttpError(403, "No hay operaciones asignadas a ambos extremos.");
        for (JsonNode keys : endpoints) {
            boolean permitted = false;
            for (JsonNode keyNode : keys) {
                JsonNode allowed = policy.path("operaciones").path(keyNode.asText()).path(String.valueOf(user.get("rol")));
                boolean all = true;
                for (String verb : required) {
                    boolean has = false;
                    for (JsonNode candidate : allowed) if (verb.equals(candidate.asText())) has = true;
                    all &= has;
                }
                permitted |= all;
            }
            if (!permitted) throw new HttpError(403, "Se requieren permisos sobre ambos extremos del vínculo.");
        }
    }
}
