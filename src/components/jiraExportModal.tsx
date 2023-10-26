import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useState } from "react";
import Decimal from "decimal.js";
import { FaJira } from "react-icons/fa";
import { cn } from "~/utils/cn";

type TicketInput = {
  ticketId: string;
  url: string;
  value: number | string | Decimal;
};

export default function JiraExportModal(props: {
  open: boolean;
  toExport: TicketInput[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [cloudId, setCloudId] = useState("");

  const domains = api.jira.getJIRASites.useQuery();

  const allFields = api.jira.getJIRAFields.useQuery({
    cloudId,
  });

  const [fieldId, setFieldId] = useState("");

  const submitMutation = api.jira.exportTickets.useMutation();

  return (
    <HtmlDialog {...props}>
      <div className="modal-box relative max-w-3xl">
        <h3 className="flex items-center justify-center gap-4 pb-4 text-center text-xl">
          Export Tickets to JIRA
          <FaJira size={32} />
        </h3>
        <div className="divider horizontal"></div>
        <div className="flex w-full items-center justify-center gap-4">
          <label className="label">
            <span className="label-text">Export tickets to:</span>
          </label>
          {domains.isLoading && <span className="loading loading-dots"></span>}
          {domains.isSuccess && (
            <select
              className="select select-bordered"
              onChange={(e) => {
                setCloudId(e.target.value);
              }}
              value={cloudId}
            >
              <option className="" key={"nil"} value={""} disabled></option>
              {domains.data?.map((domain) => {
                return (
                  <option className="" key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                );
              })}
            </select>
          )}
        </div>
        <div className="py-2"></div>
        <div className="flex w-full items-center justify-center gap-4">
          <label className="label">
            <span className="label-text">JIRA Field:</span>
          </label>
          {!cloudId && <span>Select a site to export to</span>}
          {cloudId && allFields.isLoading && (
            <span className="loading loading-dots"></span>
          )}
          {cloudId && allFields.isSuccess && allFields.data && (
            <select
              className="select select-bordered"
              onChange={(e) => {
                setFieldId(e.target.value);
              }}
              value={fieldId}
            >
              <option className="" key={"nil"} value={""} disabled></option>
              {allFields.data
                ?.sort((a, b) => {
                  return a.name.localeCompare(b.name);
                })
                .map((field) => {
                  return (
                    <option className="" key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  );
                })}
            </select>
          )}
        </div>
        <div className="modal-action">
          {submitMutation.isError && (
            <div className="rounded-md border border-error bg-base-200 p-3 text-error">
              {submitMutation.error.message}
            </div>
          )}
          <button
            className={cn("btn")}
            disabled={!fieldId || !cloudId || submitMutation.isLoading}
            onClick={() => {
              submitMutation.mutate(
                {
                  cloudId,
                  fieldId,
                  tickets: props.toExport.map((ticket) => {
                    return {
                      ticketId: ticket.ticketId,
                      value: new Decimal(ticket.value).toNumber(),
                    };
                  }),
                },
                {
                  onSuccess: () => {
                    props.onComplete();
                  },
                },
              );
            }}
          >
            {submitMutation.isLoading ? (
              <>
                <span className="loading loading-spinner"></span>Exporting...
              </>
            ) : (
              "Export"
            )}
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
