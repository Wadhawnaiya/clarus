// Client folder control: open a directory as the workspace, or pick a recent one.
// Display only — open/switch IPC lives in workspaceApi.

import { ChevronDownIcon, FolderOpenIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { clientFolderLabel } from "@/lib/clientFolder";
import { settingsApi, workspaceApi } from "@/rpc/api";

export { clientFolderLabel };

export function ClientFolderMenu() {
  const [path, setPath] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [ws, settings] = await Promise.all([workspaceApi.get(), settingsApi.get()]);
    setPath(ws.path);
    setRecents(settings.recentClientPaths ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    return workspaceApi.onChange(() => {
      void refresh();
    });
  }, [refresh]);

  const openDialog = async () => {
    setBusy(true);
    setError(null);
    try {
      await workspaceApi.open();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openRecent = async (recentPath: string) => {
    if (recentPath === path) return;
    setBusy(true);
    setError(null);
    try {
      await workspaceApi.openPath(recentPath);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const label = path ? clientFolderLabel(path) : "Client folder";
  const otherRecents = recents.filter((p) => p !== path);

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between gap-2 font-normal"
              disabled={busy}
              title={path ?? undefined}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FolderOpenIcon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuItem onClick={() => void openDialog()}>
            <FolderOpenIcon className="size-4" />
            Open Client Folder…
          </DropdownMenuItem>
          {otherRecents.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Recent</DropdownMenuLabel>
              {otherRecents.map((p) => (
                <DropdownMenuItem key={p} onClick={() => void openRecent(p)} title={p}>
                  <span className="truncate">{clientFolderLabel(p)}</span>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <p className="text-destructive px-1 text-xs text-pretty">{error}</p> : null}
    </div>
  );
}
