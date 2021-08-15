require("./vars.json").server.banner = "";
const readline = require('readline');
const Server = require('./ssh.js');
const server = new Server();

server.on("user", (stream, client, name) => {
	greet(stream);
	const rl = readline.createInterface({
		input: stream,
		output: stream,
		prompt: `C:\\Users\\${name}> `,
		terminal: true,
	});
	rl.prompt();
	rl.on("line", (data) => {
		data = data.toString().trim();
		if(data) {
			stream.write(`'${data.match(/[^\s]+/)}' is not recognized as an internal or external command,\r\n`);
			stream.write("operable program, or batch file.\r\n\n");
		}
		rl.prompt();
	});
});

function greet(stream) {
	stream.write("Microsoft Windows [Version 10.0.19042.631]\r\n");
	stream.write("(c) 2020 Microsoft Corporation. All rights reserved.\r\n");
	stream.write("\r\n");
}

server.listen(23);
