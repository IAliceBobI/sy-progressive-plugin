import { Plugin } from "siyuan";
import { getHPathByDocID, getWordsDoc } from "./helper";
import { get_siyuan_lnk_md, NewNodeID, Siyuan, siyuan, siyuanCache } from "../../sy-tomato-plugin/src/libs/utils";
import { OpenAIClient } from "../../sy-tomato-plugin/src/libs/openAI";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { windowOpenStyle, words2dailycard } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { getDailyPath } from "./FlashBox";
import { events } from "../../sy-tomato-plugin/src/libs/Events";

export class WordBuilder {
    docID: string;
    docName: string;
    boxID: string;
    rangeText: string;
    plugin: Plugin;
    bookID: string;
    anchorID: string;
    allText: string;
    settings: TomatoSettings;

    constructor(settings: TomatoSettings) {
        this.settings = settings;
    }

    private async getDocID() {
        if (words2dailycard.get()) {
            const hpath = getDailyPath()
            return siyuanCache.createDocWithMdIfNotExists(5000, events.boxID, hpath, "");
        } else {
            const hpath = await getHPathByDocID(this.bookID, "words");
            return getWordsDoc(this.bookID, this.boxID, hpath)
        }
    }

    async digest(addCard = false, ai = false) {
        if (!this.rangeText) {
            siyuan.pushMsg(tomatoI18n.请选择词语, 2000);
            return;
        }
        const wordID = await this.getDocID();
        const id = NewNodeID()
        const innerID = NewNodeID()
        await siyuan.appendBlock(superBlock(id, innerID, this.rangeText, this.anchorID), wordID);
        await OpenSyFile2(this.plugin, id, windowOpenStyle.get() as any);

        if (ai) {
            const model = OpenAIClient.getOfficalModel(true);
            if (model) {
                let first = "en_US";
                const second = Siyuan.config.appearance.lang;
                if (first === second) {
                    first = "zh_CN"
                }
                const p = getPrompt(this.rangeText, this.allText, first, second);
                await model(p, innerID);
            } else {
                await siyuan.pushMsg(tomatoI18n.请先配置AI, 2000);
            }
        }

        if (addCard && id) {
            await siyuan.addRiffCards([id])
        }
    }
}

function superBlock(id: string, innerID: string, text: string, anchorID: string) {
    const ref = get_siyuan_lnk_md(anchorID, " * ")
    const youdao = `[(youdao)](https://youdao.com/result?word=${text}&lang=en)`
    const shenyandayi = `[(shenyandayi)](https://www.shenyandayi.com/wantQuotesResult?lang=zh&query=${text}&mode=1&category=2001&category_s=%255B%22200102%22%252C%22200104%22%255D&categorySearch=1)`
    const baidu = `[(baidu)](https://www.baidu.com/s?wd=${text})`
    const zhihu = `[(zhihu)](https://www.zhihu.com/search?type=content&q=${text})`
    const google = `[(google)](https://www.google.com/search?q=${text}+meaning)`
    const bing = `[(bing)](https://www.bing.com/search?q=${text}+meaming&FORM=AWRE)`
    return `{{{row

${text}${ref} ${youdao} ${shenyandayi} ${baidu} ${zhihu} ${bing} ${google}
{: id="${NewNodeID()}"}

{: id="${innerID}"}

}}}
{: id="${id}" custom-prog-words="1"}

{: id="${NewNodeID()}"}
`.trim()
}

function getPrompt(text: string, context: string, firstLang: string, secondLang: string) {
    return `CONTEXT:
${context}

WORD:
${text}

---

You are a humorous language expert proficient in multiple languages. 
Please very very briefly explain the WORD based on the CONTEXT above in both ${firstLang} and ${secondLang}, 
and provide a typical example sentence in each language.
`.trim();
}
