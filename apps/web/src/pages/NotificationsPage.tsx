import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { request, requestPage } from "../lib/api";
import { EmptyState, ErrorState, LoadingBlock, StatusBadge } from "../components/States";

interface NotificationRow {
  id: string;
  event: string;
  channel: string;
  subject: string;
  body: string;
  caseId: string | null;
  deliveryStatus: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsPage() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => requestPage<NotificationRow>("/notifications?pageSize=50"),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => request(`/notifications/${id}/read`, { method: "POST", body: {} }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (query.isLoading) return <LoadingBlock label="Loading notifications" />;
  if (query.isError) {
    return (
      <ErrorState
        title="We could not load your notifications"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const rows = query.data?.data ?? [];

  return (
    <div className="space-y-6">
       <header className="flex flex-wrap items-center justify-between gap-3">
         <div>
           <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Notifications</h1>
           <p className="mt-1.5 text-sm text-ink-600">
             Updates about your background verification.
           </p>
         </div>
         {rows.some((row) => !row.readAt) ? (
           <button
             type="button"
             className="btn-secondary btn-sm"
             onClick={() => rows.filter((row) => !row.readAt).forEach((row) => markRead.mutate(row.id))}
           >
             <CheckCheck className="h-4 w-4" aria-hidden="true" />
             Mark all read
           </button>
         ) : null}
       </header>

       {rows.length === 0 ? (
         <EmptyState title="No notifications yet" />
       ) : (
         <ul className="space-y-3">
           {rows.map((notification) => (
             <li
               key={notification.id}
               className={`surface ${notification.readAt ? "" : "border-brand-200 bg-brand-50/40"}`}
             >
               <div className="p-4 sm:p-5">
                 <div className="flex flex-wrap items-start justify-between gap-2">
                   <div className="flex items-start gap-2.5">
                     <Bell
                       className={`mt-0.5 h-4 w-4 ${notification.readAt ? "text-ink-400" : "text-brand-600"}`}
                       aria-hidden="true"
                     />
                     <h2 className="text-sm font-semibold text-ink-900">
                       {notification.subject}
                     </h2>
                   </div>
                   <div className="flex items-center gap-2">
                     <StatusBadge
                       tone={notification.deliveryStatus === "SENT" ? "success" : "warning"}
                     >
                       {notification.channel.toLowerCase()}
                     </StatusBadge>
                     {!notification.readAt ? (
                       <button
                         type="button"
                         className="text-sm font-semibold text-brand-700 underline"
                         onClick={() => markRead.mutate(notification.id)}
                       >
                         Mark as read
                       </button>
                     ) : null}
                   </div>
                 </div>
                 <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{notification.body}</p>
                 <p className="mt-2 text-xs text-ink-500">
                   {new Date(notification.createdAt).toLocaleString(undefined, {
                     dateStyle: "medium",
                     timeStyle: "short",
                   })}
                 </p>
               </div>
             </li>
           ))}
         </ul>
       )}
    </div>
  );
}
