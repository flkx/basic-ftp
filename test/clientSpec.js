const assert = require("assert");
const Client = require("../lib/ftp").Client;
const SocketMock = require("./SocketMock");

const featReply = `
211-Extensions supported:
 MLST size*;create
 SIZE
211 END
`;

const featEmptyReply = `
211 No features
`;

class MockError {
    constructor(info) {
        this.info = info;
    }
}

describe("Convenience API", function() {
    this.timeout(100);
    let client;
    beforeEach(function() {
        client = new Client();
        client.prepareTransfer = () => {}; // Don't change
        client.ftp.socket = new SocketMock();
        client.ftp.dataSocket = new SocketMock();
    });

    /** 
     * Testing simple convenience functions follows the same pattern:
     * 1. Call some method on client (func)
     * 2. This makes client send an FTP command (command)
     * 3. Which then results in a reply (reply). Use undefined to simulate a socket error.
     * 4. The tested client method will translate this into a result (result). Use MockError to expect exception to be thrown.
     */
    const tests = [
        {
            name: "can get a filesize",
            func: c => c.size("file.txt"),
            command: "SIZE file.txt\r\n",
            reply: "213 1234\r\n",
            result: 1234
        },
        {
            name: "can get features",
            func: c => c.features(),
            command: "FEAT\r\n",
            reply: featReply,
            result: new Map([["MLST", "size*;create"], ["SIZE", ""]])
        },
        {
            name: "can handle empty feature response",
            func: c => c.features(),
            command: "FEAT\r\n",
            reply: featEmptyReply,
            result: new Map()
        },
        {
            name: "can handle error response when requesting features",
            func: c => c.features(),
            command: "FEAT\r\n",
            reply: "500 Error\r\n",
            result: new Map()
        },
        {
            name: "can send a command",
            func: c => c.send("TEST"),
            command: "TEST\r\n",
            reply: "200 Ok\r\n",
            result: { code: 200, message: '200 Ok' }
        },
        {
            name: "send command: can handle error",
            func: c => c.send("TEST"),
            command: "TEST\r\n",
            reply: "500 Error\r\n",
            result: new MockError({ code: 500, message: '500 Error' })
        },
        {
            name: "send command: can optionally ignore error response (>=400)",
            func: c => c.send("TEST", true),
            command: "TEST\r\n",
            reply: "400 Error\r\n",
            result: { code: 400, message: '400 Error' }
        },
        {
            name: "send command: ignoring error responses still throws error for connection errors",
            func: c => c.send("TEST", true),
            command: "TEST\r\n",
            reply: undefined,
            result: new MockError({ error: { info: "SocketError" } })
        },
        {
            name: "can get the working directory",
            func: c => c.pwd(),
            command: "PWD\r\n",
            reply: `257 "/this/that" is current directory.\r\n`,
            result: "/this/that"
        },
        {
            name: "can change the working directory",
            func: c => c.cd("foo"),
            command: "CWD foo\r\n",
            reply: "250 Okay",
            result: { code: 250, message: "250 Okay" }
        },
        {
            name: "can remove a file",
            func: c => c.remove("foo.txt"),
            command: "DELE foo.txt\r\n",
            reply: "250 Okay",
            result: { code: 250, message: "250 Okay" }
        },             
    ];

    tests.forEach(test => {
        it(test.name, function() {               
            client.ftp.socket.once("didSend", buf => {
                assert.equal(buf.toString(), test.command);
                if (test.reply) {
                    client.ftp.socket.emit("data", Buffer.from(test.reply));
                }
                else {
                    client.ftp.socket.emit("error", { info: "SocketError" })
                }
             });
            const promise = test.func(client);
            if (test.result instanceof MockError) {
                return promise.catch(err => assert.deepEqual(err, test.result.info));
            }
            else {
                return promise.then(result => assert.deepEqual(result, test.result));
            }               
        });
    });
});