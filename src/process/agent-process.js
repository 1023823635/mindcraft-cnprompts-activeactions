import { spawn } from 'child_process';

export class AgentProcess {
    static runningCount = 0;

    constructor() {
        this.commands = {}; // 初始化命令列表
        this.commandListText = ''; // 用于存储命令列表的文本表示
    }

    // 添加 commandListText 参数
    start(profile, load_memory = false, init_message = null, count_id = 0, commandListText = '') {
        this.commandListText = commandListText; // 保存命令列表文本

        let args = ['src/process/init-agent.js', this.name];
        args.push('-p', profile);
        args.push('-c', count_id);
        if (load_memory)
            args.push('-l', load_memory);
        if (init_message)
            args.push('-m', init_message);

        const agentProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit',
            env: {
                ...process.env,
                COMMAND_LIST_TEXT: this.commandListText // 传递命令列表文本
            }
        });
        AgentProcess.runningCount++;

        let last_restart = Date.now();
        agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);

            if (code !== 0) {
                // agent must run for at least 10 seconds before restarting
                if (Date.now() - last_restart < 10000) {
                    console.error(`Agent process ${profile} exited too quickly and will not be restarted.`);
                    AgentProcess.runningCount--;
                    if (AgentProcess.runningCount <= 0) {
                        console.error('All agent processes have ended. Exiting.');
                        process.exit(0);
                    }
                    return;
                }
                console.log('Restarting agent...');
                this.start(profile, true, 'Agent process restarted.', count_id, this.commandListText);
                last_restart = Date.now();
            }
        });

        agentProcess.on('error', (err) => {
            console.error('Failed to start agent process:', err);
        });
    }

    // 添加 generateCommandListText 方法
    generateCommandListText() {
        return Object.values(this.commands).map(command => {
            if (command.format) {
                return `${command.format}: ${command.description}`;
            } else {
                let paramsFormat = '';
                if (command.params && Object.keys(command.params).length > 0) {
                    const params = Object.entries(command.params).map(([paramName]) => {
                        return `${paramName}`;
                    });
                    paramsFormat = `${command.name}(${params.join(', ')})`;
                } else {
                    paramsFormat = command.name;
                }
                return `${paramsFormat}: ${command.description}`;
            }
        }).join('\n');
    }

    // 修改 registerCommand 方法
    registerCommand(command) {
        if (!this.commands) {
            this.commands = {};
        }
        this.commands[command.name] = command;
        console.log(`Command registered: ${command.name} - ${command.description}`);
    }

    // 用于执行命令的方法
    async executeCommand(name, ...args) {
        const command = this.commands[name];
        if (command) {
            try {
                return await command.perform(this, ...args);
            } catch (error) {
                console.error(`Error executing command "${name}":`, error);
                return `Error executing command "${name}": ${error.message}`;
            }
        } else {
            throw new Error(`Command "${name}" not found.`);
        }
    }
}
