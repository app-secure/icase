package app;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Se ejecuta al terminar el arranque: las migraciones de Flyway ya se aplicaron. */
@Component
public class AuthBootstrap implements ApplicationRunner {
    private final Auth auth;

    public AuthBootstrap(Auth auth) {
        this.auth = auth;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        auth.init();
    }
}
