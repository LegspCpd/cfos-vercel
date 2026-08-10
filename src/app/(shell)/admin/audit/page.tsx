'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle, ScrollText } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import AuditLogView from '@/components/AuditLogView';

// 操作日志: all audit/activity logs in one place (admin only).
export default function AdminAuditPage() {
  const router = useRouter();
  const [notAdmin, setNotAdmin] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        if (!me.permissions?.includes('admin.access')) setNotAdmin(true);
      })
      .catch(() => setNotAdmin(true));
  }, [router]);

  if (notAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center text-muted-foreground">
        <XCircle className="mx-auto mb-4 h-10 w-10" />
        <p>你没有权限访问操作日志。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">操作日志</h1>
          <p className="text-sm text-muted-foreground">
            记录登录（含 IP）、工作区操作、Agent 运行和 AI 调用（含 token 用量）。
          </p>
        </div>
      </div>
      <AuditLogView />
    </div>
  );
}
