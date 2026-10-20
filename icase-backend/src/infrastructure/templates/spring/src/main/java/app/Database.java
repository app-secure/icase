package app;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.sql.Connection;
import java.sql.DriverManager;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** Conexión a partir de DATABASE_URL (postgresql://usuario:clave@host:5432/base), igual que en la variante Node. */
@Configuration
public class Database {
    private static final int ATTEMPTS = 15;

    @Bean
    public DataSource dataSource(Data data) throws Exception {
        String raw = System.getenv("DATABASE_URL");
        if (raw == null || raw.isBlank()) throw new IllegalStateException("DATABASE_URL no está definido.");
        URI uri = new URI(raw);
        String[] credentials = uri.getUserInfo() == null ? new String[] {"", ""} : uri.getUserInfo().split(":", 2);
        String user = credentials[0];
        String password = credentials.length > 1 ? credentials[1] : "";
        String path = uri.getPath() == null ? "" : uri.getPath();
        String jdbc = data.model().postgres()
            ? "jdbc:postgresql://" + uri.getHost() + ":" + (uri.getPort() < 0 ? 5432 : uri.getPort()) + path
            : "jdbc:mysql://" + uri.getHost() + ":" + (uri.getPort() < 0 ? 3306 : uri.getPort()) + path
                + "?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&allowPublicKeyRetrieval=true";
        waitForDatabase(jdbc, user, password);
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(jdbc);
        config.setUsername(user);
        config.setPassword(password);
        config.setMaximumPoolSize(10);
        return new HikariDataSource(config);
    }

    /** La base de datos puede tardar en aceptar conexiones al arrancar: se reintenta antes de rendirse. */
    private static void waitForDatabase(String jdbc, String user, String password) throws Exception {
        for (int attempt = 1; ; attempt++) {
            try (Connection ignored = DriverManager.getConnection(jdbc, user, password)) {
                return;
            } catch (Exception error) {
                if (attempt >= ATTEMPTS) throw error;
                System.err.println("Base de datos no disponible (" + error.getMessage() + "); reintento " + attempt + "/" + (ATTEMPTS - 1));
                Thread.sleep(2000);
            }
        }
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}
