package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;

public final class AssociationPermissions {
    private AssociationPermissions() {}

    private static boolean ownsScoped(JsonNode policy, Map<String, Object> user, JsonNode keys) {
        for (JsonNode keyNode : keys) {
            JsonNode entry = policy.path("operaciones").path(keyNode.asText()).path(String.valueOf(user.get("rol")));
            if (!entry.isMissingNode() && !entry.isNull() && !entry.isArray() && "propios".equals(entry.path("alcance").asText(""))) return true;
        }
        return false;
    }

    public static void check(JsonNode policy, JsonNode contract, Map<String, Object> user, String method, String key) {
        JsonNode found = null;
        for (JsonNode item : contract.path("associations")) if (key.equals(item.path("table").asText())) { found = item; break; }
        if (found == null) throw new HttpError(404, "Relación inexistente.");
        if ("administrador".equals(user.get("rol"))) return;
        JsonNode endpoints = found.path("operations");
        if (endpoints.size() != 2) throw new HttpError(403, "No hay operaciones asignadas a ambos extremos.");
        if (ownsScoped(policy, user, endpoints.get(0)) || ownsScoped(policy, user, endpoints.get(1))) {
            throw new HttpError(403, "Los vínculos N:M no admiten alcance de registros propios.");
        }
        List<String> required = "GET".equals(method) ? List.of("GET") : List.of("GET", "PATCH");
        for (JsonNode keys : endpoints) {
            boolean permitted = false;
            for (JsonNode keyNode : keys) {
                JsonNode allowed = policy.path("operaciones").path(keyNode.asText()).path(String.valueOf(user.get("rol")));
                List<String> methods = Auth.methodsOf(allowed);
                boolean all = true;
                for (String verb : required) all &= methods.contains(verb);
                permitted |= all;
            }
            if (!permitted) throw new HttpError(403, "Se requieren permisos sobre ambos extremos del vínculo.");
        }
    }
}
