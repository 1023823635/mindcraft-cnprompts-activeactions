import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { actionsList } from './src/agent/commands/actions.js'; // 导入 actions.js 中的命令列表
import { queryList } from './src/agent/commands/queries.js';  // 导入 queries.js 中的查询命令列表

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .help()
        .alias('help', 'h')
        .parse();
}

function getProfiles(args) {
    return args.profiles || settings.profiles;
}

function main() {
    const args = parseArguments();
    const profiles = getProfiles(args);
    console.log(profiles);
    const { load_memory, init_message } = settings;

    for (let i = 0; i < profiles.length; i++) {
        const agent = new AgentProcess();

        // 注册 actions.js 中定义的命令
        actionsList.forEach(action => {
            agent.registerCommand(action);
        });

        // 注册 queries.js 中定义的查询命令
        queryList.forEach(query => {
            agent.registerCommand(query);
        });

        // 生成命令列表文本
        const commandListText = Object.values(agent.commands).map(command => {
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

        // 打印注册的命令，包含名称和描述
        console.log(`Commands registered for agent ${profiles[i]}:`);
        Object.values(agent.commands).forEach(command => {
            // 构建参数格式字符串
            let paramsFormat = '';
            if (command.format) {
                paramsFormat = command.format;
            } else if (command.params && Object.keys(command.params).length > 0) {
                const params = Object.entries(command.params).map(([paramName, paramInfo]) => {
                    return `${paramName}`;
                });
                paramsFormat = `${command.name}(${params.join(', ')})`;
            } else {
                paramsFormat = command.name;
            }
            console.log(`- ${paramsFormat}: ${command.description}`);
        });

        // 启动代理时，传递命令列表文本
        agent.start(profiles[i], load_memory, init_message, i, commandListText);
    }
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}
