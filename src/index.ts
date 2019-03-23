import {app} from './app';

const {
  PORT = 3000,
} = process.env;

// export server to enable testing.
export let server;

// start listening on port.
server = app.listen(PORT, () => console.info(`Listening on port ${PORT}`));
