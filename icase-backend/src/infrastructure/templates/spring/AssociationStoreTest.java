package app;

import java.sql.*;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssociationStoreTest {
    private record Fixture(AssociationStore store, DataSource source, Connection connection) {}
    private Fixture fixture(String engine) throws Exception {
        Data data = mock(Data.class);
        var json = Support.JSON.readTree("""
          {"database":"%s","associations":[{"table":"rel_a_b"}],"tables":{"rel_a_b":{"columns":[{"name":"source_id","column":"source_id","type":"id","references":"a"},{"name":"target_id","column":"target_id","type":"id","references":"b"}]}},"operations":{}}
          """.formatted(engine));
        when(data.model()).thenReturn(new Model(json));
        DataSource source = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        when(source.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            PreparedStatement statement = mock(PreparedStatement.class);
            ResultSet rows = mock(ResultSet.class);
            when(rows.next()).thenReturn(true, false);
            when(rows.getString("source_id")).thenReturn("1");
            when(rows.getString("target_id")).thenReturn("2");
            when(statement.executeQuery()).thenReturn(rows);
            return statement;
        });
        return new Fixture(new AssociationStore(source, data), source, connection);
    }
    @Test void transactionalMutationsForBothEngines() throws Exception {
        for (String engine : new String[]{"postgres", "mysql"}) {
            var f = fixture(engine);
            var input = Support.JSON.readTree("{\"source_id\":\"1\",\"target_id\":\"2\"}");
            assertEquals(true, ((Map<?, ?>) f.store().run("link", "rel_a_b", input)).get("associated"));
            assertEquals(false, ((Map<?, ?>) f.store().run("unlink", "rel_a_b", input)).get("associated"));
            verify(f.connection(), times(2)).commit();
            verify(f.connection(), times(2)).close();
            verify(f.connection(), never()).rollback();
            verify(f.connection()).prepareStatement(contains(engine.equals("postgres") ? "ON CONFLICT" : "ON DUPLICATE KEY"));
        }
    }
    @Test void cursorIsBoundAsParameter() throws Exception {
        var f = fixture("postgres");
        var result = (Map<?, ?>) f.store().run("list", "rel_a_b", Support.JSON.readTree("{\"source_id\":\"1\",\"after_target_id\":\"900\",\"limit\":\"10\"}"));
        assertEquals(false, result.get("has_more"));
        verify(f.connection()).prepareStatement(contains("target_id > ?"));
        verify(f.connection()).commit();
    }
    @Test void invalidInputsNeverReachDatabase() throws Exception {
        var f = fixture("mysql");
        for (String json : new String[]{"{}", "{\"source_id\":1,\"target_id\":\"2\"}", "{\"source_id\":\"1\",\"target_id\":\"9223372036854775808\"}", "{\"source_id\":\"1\",\"target_id\":\"2;DROP TABLE\"}"}) {
            assertEquals(400, assertThrows(HttpError.class, () -> f.store().run("link", "rel_a_b", Support.JSON.readTree(json))).status());
        }
        assertEquals(404, assertThrows(HttpError.class, () -> f.store().run("link", "inventada", null)).status());
        verifyNoInteractions(f.source());
    }
    @Test void absentEndpointRollsBack() throws Exception {
        var f = fixture("postgres");
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet empty = mock(ResultSet.class);
        when(statement.executeQuery()).thenReturn(empty);
        when(f.connection().prepareStatement(anyString())).thenReturn(statement);
        assertEquals(404, assertThrows(HttpError.class, () -> f.store().run("link", "rel_a_b", Support.JSON.readTree("{\"source_id\":\"1\",\"target_id\":\"2\"}"))).status());
        verify(f.connection()).rollback(); verify(f.connection()).close(); verify(f.connection(), never()).commit();
    }
    @Test void permissionsRequireBothEndpoints() throws Exception {
        var contract = Support.JSON.readTree("{\"associations\":[{\"table\":\"rel_a_b\",\"operations\":[[\"a\"],[\"b\"]]}]}");
        var policy = Support.JSON.readTree("{\"operaciones\":{\"a\":{\"lector\":[\"GET\"],\"editor\":[\"GET\",\"PATCH\"]},\"b\":{\"lector\":[\"GET\"],\"editor\":[\"GET\",\"PATCH\"]}}}");
        assertDoesNotThrow(() -> AssociationPermissions.check(policy, contract, Map.of("rol", "lector"), "GET", "rel_a_b"));
        assertEquals(403, assertThrows(HttpError.class, () -> AssociationPermissions.check(policy, contract, Map.of("rol", "lector"), "POST", "rel_a_b")).status());
        assertDoesNotThrow(() -> AssociationPermissions.check(policy, contract, Map.of("rol", "editor"), "DELETE", "rel_a_b"));
        ((com.fasterxml.jackson.databind.node.ObjectNode) policy.path("operaciones").path("b")).remove("editor");
        assertEquals(403, assertThrows(HttpError.class, () -> AssociationPermissions.check(policy, contract, Map.of("rol", "editor"), "POST", "rel_a_b")).status());
    }
    @Test void authUsesDecodedServletPath() throws Exception {
        Auth auth = mock(Auth.class);
        when(auth.enabled()).thenReturn(true);
        when(auth.authenticate(any())).thenReturn(Map.of("rol", "lector"));
        var req = new MockHttpServletRequest("POST", "/api/associations/rel%5Fa%5Fb");
        req.setServletPath("/api/associations/rel_a_b");
        new AuthFilter(auth).doFilter(req, new MockHttpServletResponse(), (a, b) -> {});
        verify(auth).authorize(any(), eq("POST"), eq("/api/associations/rel_a_b"));
    }
}
