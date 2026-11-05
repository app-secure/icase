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

    /** Explorador Swagger UI estático (CDN). No incluye SpringDoc ni assets empaquetados. */
    @GetMapping(value = "/api/docs", produces = "text/html;charset=UTF-8")
    public String docs() {
        return """
            <!DOCTYPE html>
            <html lang="es"><head>
            <meta charset="UTF-8"/>
            <meta name="viewport" content="width=device-width,initial-scale=1"/>
            <title>Documentación de la API</title>
            <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css"/>
            <style>body{margin:0}</style>
            </head><body>
            <div id="swagger-ui"></div>
            <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
            <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js"></script>
            <script>
            window.ui = SwaggerUIBundle({
              url: '/api/openapi.json',
              dom_id: '#swagger-ui',
              presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
              layout: 'StandaloneLayout',
              deepLinking: true
            });
            </script>
            </body></html>
            """;
    }
}
