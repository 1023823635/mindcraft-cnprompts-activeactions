import * as skills from '../library/skills.js';
import settings from '../../../settings.js';

// 包装执行函数，处理异步操作和超时
function wrapExecution(func, resume=false, timeout=-1) {
    return async function (agent, ...args) {
        let code_return;
        const wrappedFunction = async () => {
            await func(agent, ...args);
        };
        if (resume) {
            code_return = await agent.coder.executeResume(wrappedFunction, timeout);
        } else {
            code_return = await agent.coder.execute(wrappedFunction, timeout);
        }
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }
}

export const actionsList = [
    // !newAction: 执行新的、自定义的行为，这些行为在现有命令中不可用
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command.', 
        params: {
            'prompt': { type: 'string', description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.' }
        },
        perform: async function (agent, prompt) {
            // 忽略 prompt - 它现在在聊天历史中
            if (!settings.allow_insecure_coding)
                return 'newAction not allowed! Code writing is disabled in settings. Notify the user.';
            return await agent.coder.generateCode(agent.history);
        }
    },
    // !stop: 强制停止所有当前执行的动作和命令
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.cancelResume();
            agent.bot.emit('idle');
            let msg = 'Agent stopped.';
            if (agent.self_prompter.on)
                msg += ' Self-prompting still active.';
            return msg;
        }
    },
    // !stfu: 停止所有聊天和自我提示，但继续当前动作
    {
        name: '!stfu',
        description: 'Stop all chatting and self prompting, but continue current action.',
        perform: async function (agent) {
            agent.bot.chat('Shutting up.');
            agent.shutUp();
            return;
        }
    },
    // !restart: 重启代理进程
    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async function (agent) {
            await agent.history.save();
            agent.cleanKill();
        }
    },
    // !clearChat: 清除聊天记录
    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async function (agent) {
            agent.history.clear();
            return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
        }
    },
    // !goToPlayer: 前往指定玩家
    {
        name: '!goToPlayer',
        description: 'Go to the given player.',
        params: {
            'player_name': {type: 'string', description: 'The name of the player to go to.'},
            'closeness': {type: 'float', description: 'How close to get to the player.', domain: [0, Infinity]}
        },
        perform: wrapExecution(async (agent, player_name, closeness) => {
            closeness = Math.abs(closeness); // 确保 closeness 为正数
            return await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    // !followPlayer: 不断跟随指定玩家，并在自我防御模式开启时保护该玩家
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player. Will defend that player if self_defense mode is on.',
        params: {
            'player_name': {type: 'string', description: 'name of the player to follow.'},
            'follow_dist': {type: 'float', description: 'The distance to follow from.', domain: [0, Infinity]}
        },
        perform: wrapExecution(async (agent, player_name, follow_dist) => {
            follow_dist = Math.abs(follow_dist); // 确保 follow_dist 为正数
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, true)
    },
    // !goToBlock: 前往最近的指定类型方块
    {
        name: '!goToBlock',
        description: 'Go to the nearest block of a given type.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to go to.' },
            'closeness': { type: 'float', description: 'How close to get to the block.', domain: [0, Infinity] },
            'search_range': { type: 'float', description: 'The distance to search for the block.', domain: [0, Infinity] }
        },
        perform: wrapExecution(async (agent, type, closeness, range) => {
            closeness = Math.abs(closeness); // 确保 closeness 为正数
            range = Math.abs(range); // 确保 search_range 为正数
            await skills.goToNearestBlock(agent.bot, type, closeness, range);
        })
    },
    // !moveAway: 从当前位置向任意方向移动指定距离
    {
        name: '!moveAway',
        description: 'Move away from the current location in any direction by a given distance.',
        params: {'distance': { type: 'float', description: 'The distance to move away.', domain: [0, Infinity] }},
        perform: wrapExecution(async (agent, distance) => {
            distance = Math.abs(distance); // 确保 distance 为正数
            await skills.moveAway(agent.bot, distance);
        })
    },
    // !rememberHere: 以指定名称保存当前位置
    {
        name: '!rememberHere',
        description: 'Save the current location with a given name.',
        params: {'name': { type: 'string', description: 'The name to remember the location as.' }},
        perform: async function (agent, name) {
            const pos = agent.bot.entity.position;
            // 不修改坐标，允许负数值
            agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
            return `Location saved as "${name}".`;
        }
    },
    // !goToPlace: 前往已保存的位置
    {
        name: '!goToPlace',
        description: 'Go to a saved location.',
        params: {'name': { type: 'string', description: 'The name of the location to go to.' }},
        perform: wrapExecution(async (agent, name) => {
            const pos = agent.memory_bank.recallPlace(name);
            if (!pos) {
                skills.log(agent.bot, `No location named "${name}" saved.`);
                return;
            }
            // 不修改坐标，允许负数值
            await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
        })
    },
    // !givePlayer: 将指定物品给予指定玩家
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player.',
        params: { 
            'player_name': { type: 'string', description: 'The name of the player to give the item to.' }, 
            'item_name': { type: 'ItemName', description: 'The name of the item to give.' },
            'num': { type: 'int', description: 'The number of items to give.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent, player_name, item_name, num) => {
            num = Math.abs(num); // 确保 num 为正数
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    // !consume: 消耗指定物品（吃/喝）
    {
        name: '!consume',
        description: 'Eat/drink the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to consume.' }},
        perform: wrapExecution(async (agent, item_name) => {
            await agent.bot.consume(item_name);
            skills.log(agent.bot, `Consumed ${item_name}.`);
        })
    },
    // !equip: 装备指定物品
    {
        name: '!equip',
        description: 'Equip the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to equip.' }},
        perform: wrapExecution(async (agent, item_name) => {
            await skills.equip(agent.bot, item_name);
        })
    },
    // !putInChest: 将指定物品放入最近的箱子
    {
        name: '!putInChest',
        description: 'Put the given item in the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to put in the chest.' },
            'num': { type: 'int', description: 'The number of items to put in the chest.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent, item_name, num) => {
            num = Math.abs(num); // 确保 num 为正数
            await skills.putInChest(agent.bot, item_name, num);
        })
    },
    // !takeFromChest: 从最近的箱子中取出指定数量的物品
    {
        name: '!takeFromChest',
        description: 'Take the given items from the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to take.' },
            'num': { type: 'int', description: 'The number of items to take.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent, item_name, num) => {
            num = Math.abs(num); // 确保 num 为正数
            await skills.takeFromChest(agent.bot, item_name, num);
        })
    },
    // !viewChest: 查看最近箱子的物品和数量
    {
        name: '!viewChest',
        description: 'View the items/counts of the nearest chest.',
        params: { },
        perform: wrapExecution(async (agent) => {
            await skills.viewChest(agent.bot);
        })
    },
    // !discard: 从背包中丢弃指定数量的物品
    {
        name: '!discard',
        description: 'Discard the given item from the inventory.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to discard.' },
            'num': { type: 'int', description: 'The number of items to discard.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent, item_name, num) => {
            num = Math.abs(num); // 确保 num 为正数
            const start_loc = agent.bot.entity.position;
            await skills.moveAway(agent.bot, 5);
            await skills.discard(agent.bot, item_name, num);
            // 不修改坐标，允许负数值
            await skills.goToPosition(agent.bot, start_loc.x, start_loc.y, start_loc.z, 0);
        })
    },
    // !collectBlocks: 收集最近的指定类型方块
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to collect.' },
            'num': { type: 'int', description: 'The number of blocks to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent, type, num) => {
            num = Math.abs(num); // 确保 num 为正数
            await skills.collectBlock(agent.bot, type, num);
        }, false, 10) // 10分钟超时
    },
    // !collectAllBlocks: 不断收集最近的指定类型方块，直到被停止
    {
        name: '!collectAllBlocks',
        description: 'Collect all the nearest blocks of a given type until told to stop.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to collect.' }
        },
        perform: wrapExecution(async (agent, type) => {
            let success = await skills.collectBlock(agent.bot, type, 1);
            if (!success)
                agent.coder.cancelResume();
        }, true, 3) // 3分钟超时
    },
    // !craftRecipe: 按指定次数制作指定配方
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times.',
        params: {
            'recipe_name': { type: 'ItemName', description: 'The name of the output item to craft.' },
            'num': { type: 'int', description: 'The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent, recipe_name, num) => {
            num = Math.abs(num); // 确保 num 为正数
            await skills.craftRecipe(agent.bot, recipe_name, num);
        })
    },
    // !smeltItem: 按指定次数熔炼指定物品
    {
        name: '!smeltItem',
        description: 'Smelt the given item the given number of times.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the input item to smelt.' },
            'num': { type: 'int', description: 'The number of times to smelt the item.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: async function (agent, item_name, num) {
            num = Math.abs(num); // 确保 num 为正数
            let response = await wrapExecution(async (agent) => {
                console.log('smelting item');
                return await skills.smeltItem(agent.bot, item_name, num);
            })(agent);
            if (response.indexOf('Successfully') !== -1) {
                // 修复熔炼后背包未更新的bug，仅在重启后更新
                agent.cleanKill(response + ' Safely restarting to update inventory.');
            }
            return response;
        }
    },
    // !clearFurnace: 清空最近的熔炉中的所有物品
    {
        name: '!clearFurnace',
        description: 'Take all items out of the nearest furnace.',
        params: { },
        perform: wrapExecution(async (agent) => {
            await skills.clearNearestFurnace(agent.bot);
        })
    },
    // !placeHere: 在当前位置放置指定类型的方块
    {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
        params: {'type': { type: 'BlockName', description: 'The block type to place.' }},
        perform: wrapExecution(async (agent, type) => {
            let pos = agent.bot.entity.position;
            // 不修改坐标，允许负数值
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },
    // !attack: 攻击并杀死最近的指定类型实体
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': { type: 'string', description: 'The type of entity to attack.'}},
        perform: wrapExecution(async (agent, type) => {
            await skills.attackNearest(agent.bot, type, true);
        })
    },
    // !goToBed: 前往最近的床并睡觉
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: wrapExecution(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    },
    // !activate: 激活最近的指定类型对象
    {
        name: '!activate',
        description: 'Activate the nearest object of a given type.',
        params: {'type': { type: 'BlockName', description: 'The type of object to activate.' }},
        perform: wrapExecution(async (agent, type) => {
            await skills.activateNearestBlock(agent.bot, type);
        })
    },
    // !stay: 无论发生什么都停留在当前位置，暂停所有模式
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        perform: wrapExecution(async (agent) => {
            await skills.stay(agent.bot);
        })
    },
    // !setMode: 开启或关闭指定模式，模式是持续检查和响应环境的自动行为
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
        params: {
            'mode_name': { type: 'string', description: 'The name of the mode to enable.' },
            'on': { type: 'boolean', description: 'Whether to enable or disable the mode.' }
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
                return `Mode ${mode_name} does not exist.` + modes.getDocs();
            if (modes.isOn(mode_name) === on)
                return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    // !goal: 设置一个目标提示，持续自我提示以不断努力实现目标
    {
        name: '!goal',
        description: 'Set a goal prompt to endlessly work towards with continuous self-prompting.',
        params: {
            'selfPrompt': { type: 'string', description: 'The goal prompt.' },
        },
        perform: async function (agent, prompt) {
            agent.self_prompter.start(prompt); // 不等待，不返回
        }
    },
    // !endGoal: 当目标完成时调用，停止自我提示和当前动作
    {
        name: '!endGoal',
        description: 'Call when you have accomplished your goal. It will stop self-prompting and the current action. ',
        perform: async function (agent) {
            agent.self_prompter.stop();
            return 'Self-prompting stopped.';
        }
    },
    // !npcGoal: 设置一个简单的目标供NPC自动完成（暂时注释掉，避免与goal命令混淆）
    // {
    //     name: '!npcGoal',
    //     description: 'Set a simple goal for an item or building to automatically work towards. Do not use for complex goals.',
    //     params: {
    //         'name': { type: 'string', description: 'The name of the goal to set. Can be item or building name. If empty will automatically choose a goal.' },
    //         'quantity': { type: 'int', description: 'The quantity of the goal to set. Default is 1.', domain: [1, Number.MAX_SAFE_INTEGER] }
    //     },
    //     perform: async function (agent, name=null, quantity=1) {
    //         await agent.npc.setGoal(name, quantity);
    //         agent.bot.emit('idle');  // 触发目标
    //         return 'Set npc goal: ' + agent.npc.data.curr_goal.name;
    //     }
    // },
];
