// 提示词库 IPC(仿 memory/memoryIpc.ts)。renderer 一次取全量(缓存),过滤/分页在渲染层做。
import { ipcMain } from "electron";
import { getPromptLibrary } from "./promptLibraryStore";

export function registerPromptLibraryIpc(): void {
  ipcMain.handle("nomi:prompt-library:list", async () => {
    try {
      const prompts = await getPromptLibrary();
      return { ok: true, prompts };
    } catch (error) {
      return { ok: false, prompts: [], error: error instanceof Error ? error.message : String(error) };
    }
  });
}
