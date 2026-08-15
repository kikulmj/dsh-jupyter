/**
 * Locale strings for the notebook editor surfaces (zh/en). The client
 * registers the dictionary through the locale service like the sibling
 * plugins; copy is deliberately short and technical.
 * @module dsh-jupyter/client/locales
 */
declare const zh: {
    readonly save: "保存";
    readonly saving: "保存中…";
    readonly saved: "已保存";
    readonly runAll: "全部运行";
    readonly run: "运行";
    readonly running: "运行中…";
    readonly interrupt: "中断";
    readonly restartKernel: "重启内核";
    readonly kernelRestarted: "内核已重启";
    readonly kernelBusy: "内核忙";
    readonly kernelReady: "内核就绪";
    readonly cellError: "单元格执行出错";
    readonly preview: "预览";
    readonly edit: "编辑";
    readonly delete: "删除";
    readonly code: "代码";
    readonly markdown: "Markdown";
    readonly clearOutputs: "清空输出";
    readonly emptyHint: "点击左侧文件树中的 .ipynb 文件在预览面板中打开笔记本。";
    readonly unsupportedOutput: "不支持的输出类型";
};
/** One editor copy key (derived from the zh source of truth). */
export type JupyterKey = keyof typeof zh;
/** The locale namespace this plugin owns. */
export declare const NS = "dsh-jupyter";
/** Both dictionaries, as the locale service expects. */
export declare const dictionaries: Record<'zh' | 'en', Record<JupyterKey, string>>;
/** Switch the active dictionary. */
export declare function setLanguage(language: string): void;
/** Translate one key. */
export declare function t(key: JupyterKey): string;
export {};
