import { api } from "~/utils/api";
import { cn } from "~/utils/cn";
import { ADiv } from "./aDiv";
import { HtmlDialog } from "./htmlDialog";
import { MdOutlineClose } from "react-icons/md";
import { useState } from "react";

type Value = {
  value: number;
  label: string;
};

export default function TemplateModal({
  values,
  ...props
}: {
  open: boolean;
  onClose: () => void;
  values: Value[];
}) {
  const myTemplates = api.main.getTemplates.useQuery();
  const createTemplate = api.main.createTemplate.useMutation();
  const deleteTemplate = api.main.deleteTemplate.useMutation();

  const utils = api.useContext();

  const [name, setName] = useState("");

  const [deleting, setDeleting] = useState<bigint[]>([]);

  return (
    <HtmlDialog {...props}>
      <div className="modal-box grid gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="pb-4 text-xl">Templates</h3>
          <button
            className="btn btn-circle btn-ghost btn-sm"
            onClick={() => {
              setName("");
              props.onClose();
            }}
          >
            <MdOutlineClose size={16} />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="grid gap-4 rounded border border-slate-600 p-2">
          <h4>Existing templates</h4>
          <ADiv>
            {myTemplates.data?.map((template) => {
              return (
                <ADiv key={template.id.toString()} className="grid gap-2 px-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>{template.name}</div>
                    <button
                      className={cn("btn btn-circle btn-ghost btn-sm", {
                        "btn-disabled": deleting.includes(template.id),
                      })}
                      onClick={() => {
                        setDeleting((prev) => {
                          return [...prev, template.id];
                        });
                        deleteTemplate.mutate(
                          { id: template.id },
                          {
                            onSettled: () => {
                              utils.main.getTemplates
                                .invalidate()
                                .then(() => {
                                  setDeleting((prev) => {
                                    return prev.filter(
                                      (id) => id !== template.id,
                                    );
                                  });
                                })
                                .catch(console.error);
                            },
                          },
                        );
                      }}
                    >
                      <span className="sr-only">Delete</span>
                      <MdOutlineClose size={16} />
                    </button>
                  </div>
                </ADiv>
              );
            })}
          </ADiv>
        </div>
        {values.length > 0 && (
          <div className="grid gap-4">
            <ADiv className="flex flex-wrap gap-2 rounded border-2 border-slate-600 p-2">
              {values.map((value) => {
                return (
                  <span
                    key={value.label}
                    className="badge badge-outline badge-lg"
                  >
                    {value.label}
                  </span>
                );
              })}
            </ADiv>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder="New Template Name"
              className="input input-bordered w-full"
            />
            <button
              className={cn("btn btn-ghost", {
                "btn-disabled": !name || createTemplate.isLoading,
              })}
              onClick={() => {
                createTemplate.mutate(
                  {
                    name,
                    values: values.map((v) => {
                      return {
                        value: v.value,
                        display: v.label,
                      };
                    }),
                  },
                  {
                    onSettled: () => {
                      utils.main.getTemplates.invalidate().catch(console.error);
                      setName("");
                    },
                  },
                );
              }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </HtmlDialog>
  );
}
