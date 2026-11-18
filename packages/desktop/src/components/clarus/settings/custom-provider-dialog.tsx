// Add/edit dialog for a custom OpenAI-compatible provider. "Test connection"
// and "Fetch models" hit the same GET {baseUrl}/models probe (main falls back
// to the stored key when editing with a blank key field); saving goes through
// custom_upsert and the parent restarts the agent.

import { useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { parseModelIds } from "@/lib/modelListText";
import { customApi } from "@/rpc/api";
import type { CustomProviderInfo } from "@/rpc/types";
import { ErrorBanner } from "./parts";

export interface CustomProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when editing an existing provider; unset for "Add". */
  editing: CustomProviderInfo | null;
  onSaved: (id: string) => void | Promise<void>;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

export function CustomProviderDialog({ open, onOpenChange, editing, onSaved }: CustomProviderDialogProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [key, setKey] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-initialize the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setBaseUrl(editing?.baseUrl ?? "");
    setKey("");
    setModelsText(editing?.models.join("\n") ?? "");
    setStatus(null);
    setError(null);
  }, [open, editing]);

  const models = parseModelIds(modelsText);
  const urlOk = URL_PATTERN.test(baseUrl.trim());
  const canSave = !busy && name.trim().length > 0 && urlOk && models.length > 0;
  // Add mode has no stored key to fall back on, so probing needs one typed.
  const canProbe = !busy && urlOk && (editing !== null || key.trim().length > 0);
  const keyPlaceholder = editing ? "Stored — leave blank to keep" : "sk-…";

  const probe = async (fillModels: boolean) => {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const result = await customApi.test(baseUrl.trim(), key.trim(), editing?.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(`Connected — ${result.modelIds.length} model${result.modelIds.length === 1 ? "" : "s"} found`);
      if (fillModels) setModelsText(result.modelIds.join("\n"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const result = await customApi.upsert({
        id: editing?.id,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        key: key.trim() || undefined,
        modelIds: models,
      });
      if (result.type === "error") throw new Error(result.message ?? "Failed to save provider");
      onOpenChange(false);
      await onSaved(result.id ?? editing?.id ?? "");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit custom API" : "Add custom API"}</DialogTitle>
          <DialogDescription>Any OpenAI-compatible endpoint — LM Studio, vLLM, or a hosted gateway.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field label="Display name" htmlFor="custom-provider-name">
            <Input
              value={name}
              placeholder="Acme Gateway"
              onChange={(e) => setName(e.currentTarget.value)}
              name="custom-provider-name"
            />
          </Field>
          <Field label="Base URL" htmlFor="custom-provider-url">
            <Input
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setBaseUrl(e.currentTarget.value)}
              name="custom-provider-url"
            />
          </Field>
          <Field label="API key" htmlFor="custom-provider-key">
            <Input
              type="password"
              value={key}
              placeholder={keyPlaceholder}
              onChange={(e) => setKey(e.currentTarget.value)}
              name="custom-provider-key"
            />
          </Field>
          <Field label={`Models${models.length > 0 ? ` (${models.length})` : ""}`} htmlFor="custom-provider-models">
            <Textarea
              value={modelsText}
              rows={4}
              placeholder={"gpt-4o\nllama-3.1-70b\n—one per line, or comma separated"}
              onChange={(e) => setModelsText(e.currentTarget.value)}
              name="custom-provider-models"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void probe(true)} disabled={!canProbe}>
                {busy ? "Working…" : "Fetch models"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void probe(false)} disabled={!canProbe}>
                Test connection
              </Button>
            </div>
            {status && <p className="text-muted-foreground text-xs">{status}</p>}
          </Field>
          {error && <ErrorBanner message={error} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSave}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
