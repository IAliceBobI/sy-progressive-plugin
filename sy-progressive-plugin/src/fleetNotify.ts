// 舰队「数据变了」信号通道（□7 从 fleet.ts 拆出）：fleet.ts 顶导 .svelte 组件（FleetFlame/
// DockPanel），vitest 无 svelte 插件，reviewMenu 等数据侧模块 import fleet 会把 svelte 链
// 拉进单测直接炸。拆信号与装载：数据侧只 import 本模块发信号；fleet 启动时订阅并刷新
// 火苗/面板。信号先于 initFleet 到达=无订阅者丢弃（等价旧直调 refreshFleet 对空 UI 刷 stores）。
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyFleetChanged() {
    for (const l of [...listeners]) l();
}

/** 返回退订函数（fleet onunload 时收掉，插件重载不留死订阅） */
export function onFleetChanged(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
