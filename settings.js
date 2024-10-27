export default 
{
    "minecraft_version": "1.20.1", // 支持的 Minecraft 版本，目前支持到 1.20.4
    "host": "127.0.0.1", // Minecraft 服务的主机地址，可以是 "localhost" 或你的 IP 地址
    "port": 55916, // 服务端口号，游戏服务器监听的端口，默认是 55916
    "auth": "offline", // 身份验证模式，可以是 "offline"（离线模式）或 "microsoft"（在线 Microsoft 账号验证）
    
    "profiles": [
        "./BOTQWEN.json",
        //"./BOTLLAMA.json",
        // 可以添加更多机器人配置文件，检查 "./profiles/" 目录以获取更多配置
        // 如果添加多个配置文件，每个机器人需要单独通过 /msg 指令联系
    ],
    "load_memory": true, // 是否从上次会话中加载记忆（false 表示不加载）
    "init_message": "你好", // 机器人生成时发送的初始消息

    "language": "zh-CN", // 语言设置，用于翻译成/从该语言翻译，支持的语言列表可以在 https://cloud.google.com/translate/docs/languages 中找到
    "show_bot_views": true, // 是否在浏览器中显示机器人的视角，例如 localhost:3000, 3001 等（false 表示不显示）

    "allow_insecure_coding": true, // 是否允许机器人通过 newAction 命令写/运行代码。如果启用，可能存在安全风险（false 表示不允许）
    "code_timeout_mins": 10, // 允许代码运行的最大分钟数，-1 表示没有时间限制

    "max_messages": 300, // 上下文中保留的最大消息数量，用于机器人记忆和理解上下文
    "max_commands": -1, // 每个响应中可以使用的最大命令数，-1 表示没有限制
    "verbose_commands": true, // 是否显示完整的命令语法，设置为 true 表示会显示
    "narrate_behavior": true // 是否在聊天中叙述简单的自动动作（例如 '正在拾取物品！'）
}
