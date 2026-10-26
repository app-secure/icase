package app;

import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletResponse;

/** CRUD de cada operación del contrato (un recurso por requisito funcional). */
@RestController
public class OperationsController {
    private final RecordStore store;

    public OperationsController(RecordStore store) {
        this.store = store;
    }

    @GetMapping("/api/operations/{operation}")
    public Object list(
        @PathVariable String operation,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String search,
        @RequestParam Map<String, String> allParams,
        HttpServletResponse response
    ) {
        Object result = store.list(operation, page, limit, search, allParams);
        if (result instanceof Map<?, ?> map && map.containsKey("pagination")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> p = (Map<String, Object>) map.get("pagination");
            response.setHeader("X-Total-Count", String.valueOf(p.get("total")));
            response.setHeader("X-Page", String.valueOf(p.get("page")));
            response.setHeader("X-Limit", String.valueOf(p.get("limit")));
            response.setHeader("X-Total-Pages", String.valueOf(p.get("total_pages")));
        }
        return result;
    }

    @PostMapping("/api/operations/{operation}")
    public ResponseEntity<Map<String, Object>> create(@PathVariable String operation, @RequestBody(required = false) JsonNode body) {
        if (body == null || !body.isObject()) throw new HttpError(400, "El cuerpo debe ser un objeto");
        return ResponseEntity.status(HttpStatus.CREATED).body(store.create(operation, body));
    }

    @PatchMapping("/api/operations/{operation}/{id}")
    public Map<String, Object> update(@PathVariable String operation, @PathVariable String id, @RequestBody(required = false) JsonNode body) {
        Map<String, Object> record = store.update(operation, id, body);
        if (record == null) throw new HttpError(404, "Registro inexistente");
        return record;
    }

    @DeleteMapping("/api/operations/{operation}/{id}")
    public Map<String, Object> remove(@PathVariable String operation, @PathVariable String id) {
        if (!store.remove(operation, id)) throw new HttpError(404, "Registro inexistente");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deleted", true);
        result.put("id", id);
        return result;
    }
}
