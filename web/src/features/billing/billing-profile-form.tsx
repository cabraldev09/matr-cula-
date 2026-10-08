"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelSubscriptionAction, saveBillingProfileAction } from "@/features/billing/actions";

export interface BillingProfileValues {
  payerName: string;
  document: string;
  email: string;
  phone: string;
  street: string;
  number: string;
  neighborhood: string;
  zipcode: string;
  city: string;
  state: string;
}

export function BillingProfileForm({ initial }: { initial: Partial<BillingProfileValues> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function submit(form: FormData) {
    start(async () => {
      const result = await saveBillingProfileAction(Object.fromEntries(form.entries()));
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.error);
    });
  }
  const field = (name: keyof BillingProfileValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={initial[name] ?? ""} {...props} />
    </div>
  );
  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("payerName", "Nome ou razão social", { required: true, maxLength: 120 })}
        {field("document", "CPF ou CNPJ", { required: true, inputMode: "numeric" })}
        {field("email", "E-mail para cobrança", { required: true, type: "email" })}
        {field("phone", "Telefone com DDD", { required: true, inputMode: "numeric" })}
      </div>
      <p className="text-xs text-muted-foreground">Endereço: obrigatório só para pagamento com cartão.</p>
      <div className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-4">{field("street", "Rua")}</div>
        <div className="sm:col-span-2">{field("number", "Número")}</div>
        <div className="sm:col-span-2">{field("neighborhood", "Bairro")}</div>
        <div className="sm:col-span-2">{field("zipcode", "CEP", { inputMode: "numeric" })}</div>
        <div className="sm:col-span-1">{field("state", "UF", { maxLength: 2 })}</div>
        <div className="sm:col-span-1 sm:hidden" />
        <div className="sm:col-span-6">{field("city", "Cidade")}</div>
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar dados de cobrança</Button>
      </div>
    </form>
  );
}

export function CancelSubscriptionButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Cancelar a renovação? O acesso continua até o fim do período já pago.")) return;
        start(async () => {
          const result = await cancelSubscriptionAction();
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" />} Cancelar renovação
    </Button>
  );
}
