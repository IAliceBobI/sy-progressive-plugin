// progressive 插件的全局状态声明（原位于 tomato 的 BaseTomatoPlugin.ts，迁回本插件）
// TomatoSettings/WordCountType/BookInfo/AsList 均为 ambient 全局类型，
// 分别定义于 ../sy-tomato-plugin/src/types/utils.d.ts 与 ./utils.d.ts（tsconfig 已包含）
declare global {
    interface Window {
        prog_zZmqus5PtYRi: {
            timeUtil: any;
            siyuan: any;
            pluginConfig: TomatoSettings;
            save?: () => void;
            pluginInstance: any;
            split?: {
                buildContentBlocks: (bookID: string, bookName: string) => Promise<WordCountType[]>;
                computePieceIndex: (contentBlocks: WordCountType[], headings: string[], bookID: string, splitWordNum: number) => Promise<WordCountType[][]>;
                saveIndex: (bookID: string, groups: WordCountType[][]) => Promise<void>;
                loadIndex: (bookID: string) => Promise<string[][]>;
                createPiece: (bookInfo: BookInfo, index: string[][], point: number, allowCard?: boolean) => Promise<string>;
                fullfilContent: (point: number, bookID: string, piecePre: string[], piece: string[], noteID: string, stype: AsList) => Promise<void>;
                runSplit: (bookID: string, point: number, bookName?: string) => Promise<string>;
            };
        };
    }
}

export {};
