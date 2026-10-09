"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LOST_REASONS, type Lead } from "@/features/crm/labels";

/** Pergunta o motivo antes de marcar o lead como perdido. O motivo entra no relatório. */
export function LoseLeadDialog({ lead, onConfirm, onCancel }: { lead: Lead | null; onConfirm: (lead: Lead, reason: string) => void; onCancel: () => void }) {
  return (
    <Dialog open={lead !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        {lead && <LoseForm key={lead.id} lead={lead} onConfirm={onConfirm} onCancel={onCancel} />}
      </DialogContent>
    </Dialog>
  );
}

function LoseForm({ lead, onConfirm, onCancel }: { lead: Lead; onConfirm: (lead: Lead, reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState<string>(LOST_REASONS[0]);
  const [note, setNote] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(lead, note.trim() ? `${reason}: ${note.trim()}` : reason);
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>Marcar {lead.contacts?.name ?? "o lead"} como perdido</DialogTitle>
        <DialogDescription>O motivo aparece nos relatórios e ajuda a equipe a ver onde as matrículas escapam.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="lost-reason">Motivo</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger id="lost-reason" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lost-note">Observação (opcional)</Label>
        <Textarea id="lost-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={3} placeholder="Ex.: achou a mensalidade alta e vai tentar outra instituição" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="destructive">Marcar como perdido</Button>
      </DialogFooter>
    </form>
  );
}
