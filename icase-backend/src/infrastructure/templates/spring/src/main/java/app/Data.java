package app;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** Datos del contrato que el generador escribe en src/main/resources/icase/. */
@Component
public class Data {
    private final JsonNode contract;
    private final JsonNode openapi;
    private final JsonNode rules;
    private final JsonNode policy;
    private final Model model;

    public Data() throws IOException {
        this.contract = read("contract.json");
        this.openapi = read("openapi.json");
        this.rules = read("rules.json");
        this.policy = read("policy.json");
        this.model = new Model(read("model.json"));
    }

    private static JsonNode read(String name) throws IOException {
        try (InputStream input = new ClassPathResource("icase/" + name).getInputStream()) {
            return Support.JSON.readTree(input);
        }
    }

    public JsonNode contract() { return contract; }
    public JsonNode openapi() { return openapi; }
    public JsonNode rules() { return rules; }
    public JsonNode policy() { return policy; }
    public Model model() { return model; }

    public boolean authEnabled() {
        return policy.path("habilitada").asBoolean(false);
    }
}
