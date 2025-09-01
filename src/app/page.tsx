"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 sm:py-6 grid gap-4 sm:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>CL8Y Guardian Protocol Admin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Link className="underline" href="/roles">Role Admin</Link>
          <Link className="underline" href="/registry">Registry Admin</Link>
          <Link className="underline" href="/bridge">Bridge</Link>
        </CardContent>
      </Card>
    </div>
  );
}
