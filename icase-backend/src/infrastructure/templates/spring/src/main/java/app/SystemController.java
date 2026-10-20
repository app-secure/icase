package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SystemController {
    private final RecordStore store;
    private final Data data;

    public SystemController(RecordStore store, Data data) {
        this.store = store;
        this.data = data;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        store.ping();
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("status", "ok");
        status.put("database", "connected");
        return status;
    }

    @GetMapping("/api/contract")
    public JsonNode contract() {
        return data.contract();
    }

    @GetMapping("/api/openapi.json")
    public JsonNode openapi() {
        return data.openapi();
    }
}
