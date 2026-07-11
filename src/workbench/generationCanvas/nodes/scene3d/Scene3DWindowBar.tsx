import { NomiBrand } from '../../../../design'
import { WindowControls } from '../../../../ui/app-shell/WindowControls'
import { handleWindowTitlebarDoubleClick } from '../../../../ui/app-shell/windowTitlebarDoubleClick'

const isWindows = window.nomiDesktop?.platform === 'win32'

export function Scene3DWindowBar(): JSX.Element | null {
  if (!isWindows) return null
  return (
    <div
      className="app-drag relative z-[2] flex h-8 w-full shrink-0 items-center border-b border-[var(--workbench-border)] bg-[var(--workbench-surface-solid)]"
      onDoubleClick={handleWindowTitlebarDoubleClick}
    >
      <div className="app-no-drag inline-flex h-full items-center pl-4 pr-3">
        <NomiBrand markSize={18} wordSize={14} />
      </div>
      <div className="h-full min-w-0 flex-1" aria-hidden="true" />
      <WindowControls className="app-no-drag" />
    </div>
  )
}
