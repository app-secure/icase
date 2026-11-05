package app;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class OwnershipAuthTest {
    @Test void methodsOfReadsObjectOrArray() throws Exception {
        assertEquals(List.of("GET", "POST"), Auth.methodsOf(Support.JSON.readTree("[\"GET\",\"POST\"]")));
        assertEquals(List.of("GET"), Auth.methodsOf(Support.JSON.readTree("{\"metodos\":[\"GET\"],\"alcance\":\"propios\"}")));
        assertEquals(List.of(), Auth.methodsOf(null));
    }

    @Test void associationRejectsOwnedScope() throws Exception {
        var policy = Support.JSON.readTree("{\"operaciones\":{\"rf-01\":{\"cliente\":{\"metodos\":[\"GET\",\"PATCH\"],\"alcance\":\"propios\"}},\"rf-02\":{\"cliente\":{\"metodos\":[\"GET\",\"PATCH\"],\"alcance\":\"todos\"}}}}");
        var contract = Support.JSON.readTree("{\"associations\":[{\"table\":\"vinculo\",\"operations\":[[\"rf-01\"],[\"rf-02\"]]}]}");
        var user = Map.<String, Object>of("id", "1", "rol", "cliente");
        var error = assertThrows(HttpError.class, () -> AssociationPermissions.check(policy, contract, user, "GET", "vinculo"));
        assertEquals(403, error.status());
        assertTrue(error.getMessage().contains("propios"));
    }
}
