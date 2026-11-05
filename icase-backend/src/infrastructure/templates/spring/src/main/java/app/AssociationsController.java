package app;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class AssociationsController {
    private final AssociationStore store;
    private final Auth auth;
    private final Model model;

    public AssociationsController(AssociationStore store, Auth auth, Data data) {
        this.store = store;
        this.auth = auth;
        this.model = data.model();
    }

    @SuppressWarnings("unchecked")
    private String ownerFor(HttpServletRequest request, String table) {
        if (!auth.enabled()) return null;
        Map<String, Object> user = (Map<String, Object>) request.getAttribute(AuthFilter.USER);
        if (user == null) return null;
        for (String key : model.operationsForTable(table)) {
            String scope = auth.ownerScope(user, key);
            if (scope != null) return scope;
        }
        return null;
    }

    private Object run(String action, String relation, JsonNode body, HttpServletRequest request) {
        Model.Association item = model.association(relation);
        return store.run(action, relation, body, ownerFor(request, item.source()), ownerFor(request, item.target()));
    }

    @GetMapping("/api/associations/{relation}")
    public Object list(@PathVariable String relation, @RequestParam Map<String, String> query, HttpServletRequest request) {
        return run("list", relation, Support.JSON.valueToTree(query), request);
    }
    @PostMapping("/api/associations/{relation}")
    public Object link(@PathVariable String relation, @RequestBody(required = false) JsonNode body, HttpServletRequest request) {
        return run("link", relation, body, request);
    }
    @DeleteMapping("/api/associations/{relation}")
    public Object unlink(@PathVariable String relation, @RequestBody(required = false) JsonNode body, HttpServletRequest request) {
        return run("unlink", relation, body, request);
    }
}
