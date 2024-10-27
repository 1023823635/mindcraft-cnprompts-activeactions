import { History } from './history.js';
import { Coder } from './coder.js';
import { Prompter } from './prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction } from './commands/index.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addViewer } from './viewer.js';
import settings from '../../settings.js';

export class Agent {
    async start(profile_fp, load_mem = false, init_message = null, count_id = 0, commandListText = '') {
        this.commandListText = commandListText; // 保存命令列表文本

        this.prompter = new Prompter(this, profile_fp, this.commandListText);
        this.name = this.prompter.getName();
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();
        this.self_prompter = new SelfPrompter(this);

        await this.prompter.initExamples();

        console.log('Logging in...');
        this.bot = initBot(this.name);

        initModes(this);

        let save_data = null;
        if (load_mem) {
            save_data = this.history.load();
        }

        this.bot.once('spawn', async () => {
            addViewer(this.bot, count_id);

            // 等待一段时间，以确保统计数据已定义
            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log(`${this.name} spawned.`);
            this.coder.clear();

            const ignore_messages = [
                "Set own game mode to",
                "Set the time to",
                "Set the difficulty to",
                "Teleported ",
                "Set the weather to",
                "Gamerule "
            ];
            const eventname = settings.profiles.length > 1 ? 'whisper' : 'chat';
            this.bot.on(eventname, async (username, message) => {
                if (username === this.name) return;

                if (ignore_messages.some((m) => message.startsWith(m))) return;

                let translation = await handleEnglishTranslation(message);

                console.log('received message from', username, ':', translation);

                this.shut_up = false;

                this.handleMessage(username, translation);
            });

            // 设置机器人在饥饿时自动进食
            this.bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 14,
                bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
            };

            if (save_data && save_data.self_prompt) {
                let prompt = save_data.self_prompt;
                // 将初始消息添加到历史记录中
                this.history.add('system', prompt);
                this.self_prompter.start(prompt);
            }
            else if (init_message) {
                this.handleMessage('system', init_message, 2);
            }
            else {
                const translation = await handleTranslation("Hello world! I am " + this.name);
                this.bot.chat(translation);
                this.bot.emit('finished_executing');
            }

            this.startEvents();
        });
    }

    async cleanChat(message, translate_up_to = -1) {
        let to_translate = message;
        let remainging = '';
        if (translate_up_to != -1) {
            to_translate = to_translate.substring(0, translate_up_to);
            remainging = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remainging;
        // 换行符被解释为单独的聊天，这会触发垃圾邮件过滤器。将它们替换为空格
        message = message.replaceAll('\n', ' ');
        return this.bot.chat(message);
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.on) {
            this.self_prompter.stop(false);
        }
    }

    async handleMessage(source, message, max_responses = null) {
        let used_command = false;
        if (max_responses === null) {
            max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (max_responses === -1) {
            max_responses = Infinity;
        }

        let self_prompt = source === 'system' || source === this.name;

        if (!self_prompt) {
            const user_command_name = containsCommand(message);
            if (user_command_name) {
                if (!commandExists(user_command_name)) {
                    this.bot.chat(`Command '${user_command_name}' does not exist.`);
                    return false;
                }
                this.bot.chat(`*${source} used ${user_command_name.substring(1)}*`);
                if (user_command_name === '!newAction') {
                    // 所有用户发起的命令都被机器人忽略，除了这个
                    // 将前面的消息添加到历史记录中，以提供 newAction 的上下文
                    this.history.add(source, message);
                }
                let execute_res = await executeCommand(this, message);
                if (execute_res)
                    this.cleanChat(execute_res);
                return true;
            }
        }

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up;

        let behavior_log = this.bot.modes.flushBehaviorLog();
        if (behavior_log.trim().length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            behavior_log = 'Recent behaviors log: \n' + behavior_log.substring(behavior_log.indexOf('\n'));
            await this.history.add('system', behavior_log);
        }

        await this.history.add(source, message);
        this.history.save();

        if (!self_prompt && this.self_prompter.on)
            max_responses = 1; // 强制只响应此消息，然后让自我提示接管
        for (let i = 0; i < max_responses; i++) {
            if (checkInterrupt()) break;
            let history = this.history.getHistory();
            let res = await this.prompter.promptConvo(history); // 不需要修改这里

            let command_name = containsCommand(res);

            if (command_name) { // 包含查询或命令
                console.log(`Full response: "${res}"`)
                res = truncCommandMessage(res); // 忽略命令之后的所有内容
                this.history.add(this.name, res);
                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist.`);
                    console.warn('Agent hallucinated command:', command_name)
                    continue;
                }
                if (command_name === '!stopSelfPrompt' && self_prompt) {
                    this.history.add('system', `Cannot stopSelfPrompt unless requested by user.`);
                    continue;
                }

                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));

                if (settings.verbose_commands) {
                    this.cleanChat(res, res.indexOf(command_name));
                }
                else { // 仅输出命令名称
                    let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                    let chat_message = `*used ${command_name.substring(1)}*`;
                    if (pre_message.length > 0)
                        chat_message = `${pre_message}  ${chat_message}`;
                    this.cleanChat(chat_message);
                }

                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);
                used_command = true;

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // 仅为对话响应
                this.history.add(this.name, res);
                this.cleanChat(res);
                console.log('Purely conversational response:', res);
                break;
            }
            this.history.save();
        }

        this.bot.emit('finished_executing');
        return used_command;
    }

    startEvents() {
        // 自定义事件
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0)
                this.bot.emit('sunrise');
            else if (this.bot.time.timeOfDay == 6000)
                this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000)
                this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000)
                this.bot.emit('midnight');
        });

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
        // 日志回调
        this.bot.on('error', (err) => {
            console.error('Error event!', err);
        });
        this.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason)
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.coder.cancelResume();
            this.coder.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                this.handleMessage('system', `You died with the final message: '${message}'. Previous actions were stopped and you have respawned. Notify the user and perform any necessary actions.`);
            }
        });
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // 清除任何残留的寻路器
            this.bot.modes.unPauseAll();
            this.coder.executeResume();
        });

        // 初始化 NPC 控制器
        this.npc.init();

        // 这个更新循环确保每次调用的 update() 是一次性的，即使它花费的时间超过了间隔
        const INTERVAL = 300;
        let last = Date.now();
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.update(start - last);
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    async update(delta) {
        await this.bot.modes.update();
        await this.self_prompter.update(delta);
    }

    isIdle() {
        return !this.coder.executing && !this.coder.generating;
    }

    cleanKill(msg = 'Killing agent process...') {
        this.history.add('system', msg);
        this.bot.chat('Goodbye world.')
        this.history.save();
        process.exit(1);
    }
}
