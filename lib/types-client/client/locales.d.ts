/**
 * Locale strings for the notebook tab (zh/en). The client registers the
 * dictionary through the locale service; the slot seat then synthesizes the
 * typed `t` prop from this namespace.
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
    readonly interpreter: "内核环境";
    readonly bundledPython: "内置 Python (dsh)";
    readonly interpreterChanged: "内核已切换，保存笔记本后记住";
    readonly interpreterUnavailable: "保存的内核环境不可用，已回退到内置 Python";
    readonly cellError: "单元格执行出错";
    readonly preview: "预览";
    readonly edit: "编辑";
    readonly delete: "删除";
    readonly code: "代码";
    readonly markdown: "Markdown";
    readonly raw: "Raw";
    readonly clearOutputs: "清空输出";
    readonly loading: "正在加载…";
    readonly modified: "未保存";
    readonly noCells: "这个笔记本还没有单元格，先添加一个：";
    readonly reload: "重新加载";
    readonly createEmpty: "以空笔记本打开";
    readonly createEmptyConfirm: "该文件不是有效的 notebook JSON。要用一个新的空笔记本覆盖它吗？原内容将丢失。";
    readonly unsupportedOutput: "不支持的输出类型";
};
/** One notebook copy key (derived from the zh source of truth). */
export type JupyterKey = keyof typeof zh;
/** The locale namespace this plugin owns. */
export declare const NS = "dsh-jupyter";
/** Both dictionaries, as the locale service expects. */
export declare const dictionaries: Record<'zh' | 'en', Record<JupyterKey, string>>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-jupyter tab copy. */
        'dsh-jupyter': JupyterKey;
    }
}
export {};
