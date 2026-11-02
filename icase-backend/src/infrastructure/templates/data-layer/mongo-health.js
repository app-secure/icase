// Ejecutado únicamente dentro del contenedor; las credenciales nunca se incluyen en argumentos o logs.
const admin = db.getSiblingDB('admin');
if (!admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) quit(1);
try {
  const status = rs.status();
  if (status.myState !== 1) quit(1);
} catch (error) {
  if (error.code !== 94) quit(1);
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'database:27017' }] });
  quit(1); // esperar la elección del primario en el siguiente healthcheck
}
if (!admin.runCommand({ hello: 1 }).isWritablePrimary) quit(1);
