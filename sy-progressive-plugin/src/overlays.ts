// □11 浮层族挂载器：四浮层（路线图/目录/路线指引/原文侧追溯）共一容器（FloatPopover），
// 单例——点开新浮层先关旧浮层（同屏只一个，浮条点击处锚定）。
// 关闭句柄挂 globalThis 注册表：思源 window.eval 执行插件无模块缓存，重载插件=整轮
// 重跑模块顶层，新代模块必须能卸掉旧代浮层（同 initProgFloatBtns 的 setGlobal 先例；
// deploy reload 不走 onunload，本地变量闭包跨代不可见——review P1 实证）。
import { mount, unmount } from "svelte";
import type { Component } from "svelte";
import FloatPopover from "./FloatPopover.svelte";

const CLOSE_REG = "progFloatPopoverClose_zZmqus5PtYRi";

// 模块顶层即清一次：重载插件（新代模块加载）时旧代浮层立即卸——不等用户再开新浮层
closeFloatPopover();

export function closeFloatPopover() {
    const prev = (globalThis as any)[CLOSE_REG];
    if (typeof prev !== "function") return;
    (globalThis as any)[CLOSE_REG] = null;
    prev();
}

export function openFloatPopover(opts: {
    title: string;
    /** 锚点（点击的按钮位置） */
    x: number;
    y: number;
    component: Component<any>;
    props?: Record<string, any>;
}) {
    closeFloatPopover();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = mount(FloatPopover, {
        target: host,
        props: {
            title: opts.title,
            x: opts.x,
            y: opts.y,
            component: opts.component,
            props: opts.props,
            onClose: closeFloatPopover,
        },
    });
    const close = () => {
        try {
            unmount(app);
        } finally {
            host.remove();
            if ((globalThis as any)[CLOSE_REG] === close) (globalThis as any)[CLOSE_REG] = null;
        }
    };
    (globalThis as any)[CLOSE_REG] = close;
}
