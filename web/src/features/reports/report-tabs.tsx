"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ReportTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Uma aba por módulo contratado. O conteúdo é montado no servidor e só trocado de lugar aqui. */
export function ReportTabs({ tabs }: { tabs: ReportTab[] }) {
  if (tabs.length === 1) return <>{tabs[0]!.content}</>;
  return (
    <Tabs defaultValue={tabs[0]!.id}>
      <TabsList>
        {tabs.map((tab) => <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>)}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab.id} value={tab.id} className="mt-5 space-y-6">{tab.content}</TabsContent>)}
    </Tabs>
  );
}
