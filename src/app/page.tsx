"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>CL8Y Guardian Protocol Admin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <a className="underline" href="/roles">Role Admin</a>
          <a className="underline" href="/registry">Registry Admin</a>
        </CardContent>
      </Card>
    </div>
  );
}
