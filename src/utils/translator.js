import settings from '../../settings.js';

const preferred_lang = settings.language;

export async function handleTranslation(message) {
    // 暂时禁用翻译功能，直接返回原始消息
    return message;
}

export async function handleEnglishTranslation(message) {
    // 暂时禁用翻译功能，直接返回原始消息
    return message;
}



