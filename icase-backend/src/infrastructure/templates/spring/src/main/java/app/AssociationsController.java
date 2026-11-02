package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class AssociationsController {
    private final AssociationStore store;
    public AssociationsController(AssociationStore store) { this.store = store; }

    @GetMapping("/api/associations/{relation}")
    public Object list(@PathVariable String relation, @RequestParam Map<String, String> query) {
        return store.run("list", relation, Support.JSON.valueToTree(query));
    }
    @PostMapping("/api/associations/{relation}")
    public Object link(@PathVariable String relation, @RequestBody(required = false) JsonNode body) {
        return store.run("link", relation, body);
    }
    @DeleteMapping("/api/associations/{relation}")
    public Object unlink(@PathVariable String relation, @RequestBody(required = false) JsonNode body) {
        return store.run("unlink", relation, body);
    }
}
