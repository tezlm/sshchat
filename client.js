const EventEmitter = require('events');
const readline = require('readline');
const color = (str, code) => `\x1b[${code}m${str}\x1b[0m`;
const vars = require("./vars.json");
const commands = new Map();

function completer(line, admin) {
	const commands = "help quit nick shrug".split(" ").map(i => `/${i} `);
	if(admin) commands.push("/kick ");
	if(!line) return [commands, line];
	const filtered = commands.filter(i => i.startsWith(line));
	return [filtered, line];
}

class Client extends EventEmitter {
	constructor(stream, username, admin = false, server = false) {
		super();
		this.username = username;
		this.name = username;
		this.admin = admin;
		this.stream = server ? stream.stdout : stream;
		this.io = readline.createInterface({
			input: server ? stream.stdin : stream,
			output: server ? stream.stdout : stream,
			prompt: "=> ",
			terminal: true,
			completer: line => completer(line, admin),
		});
	}

	init() {
		this.io.prompt();
		this.io.on("line", data => {
			this.stream.write("\x1b[A\x1b[K");
			this.handle(data.trim());
			this.io.prompt();
		});
	
		this.io.on("SIGTSTP", () => false);
		this.io.on("SIGCONT", () => false);
		this.io.on("SIGINT", () => this.emit("exit"));
		this.io.on("pause", () => this.io.resume());
		
		this.emit("meta", `=== ${this.name} joined! ===`);
	}

	handle(data) {
		if(data.length > 256) {
			return this.write("uhhh thats a bit too long (max 256)");
		}
		data = data.trim();
		if(data[0] === "/") {
			const parts = data.slice(1).split(" ");
			if(data[1] === "/") {
				this.emit("message", `${this.formatted} ${data.slice(1)}`);
			} else if(commands.has(parts[0])) {
				commands.get(parts[0])(this, parts.slice(1));
			} else {
				this.write(`unknown command ${parts[0]}\r\n`);
			}
		} else if(data) {
			this.emit("message", `${this.formatted} ${data}`);
		}
	}

	write(data) {
		this.stream.write(`\r\x1b[K${data}\r\n`);
		this.io.prompt(true);
	}

	get formatted() {
		const which = this.admin ? vars.color.admin : vars.color.user;
		const spaces = " ".repeat(vars.maxlen - this.name.length)
		return `[${color(this.name, which)}]${spaces}`;
	}

	static command(name, call) {
		commands.set(name, call);
	}
}

module.exports = Client;
