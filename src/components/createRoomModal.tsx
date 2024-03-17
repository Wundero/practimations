import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { cn } from "~/utils/cn";
import { MdOutlineClose } from "react-icons/md";
import { BiCoffee } from "react-icons/bi";
import { ADiv } from "./aDiv";
import TemplateModal from "./templateModal";

type Value = {
  value: number;
  label: string;
};

function getUnusedValue(values: Value[]): number {
  const max = values.reduce((acc, v) => Math.max(acc, v.value), 0);
  return max + 1;
}

const templates = [
  {
    name: "Scrum",
    values: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100].map((v) => {
      return {
        label: v.toString(),
        value: v,
      };
    }),
  },
  {
    name: "Fibonacci",
    values: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((v) => {
      return {
        label: v.toString(),
        value: v,
      };
    }),
  },
  {
    name: "Sequential",
    values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
      return {
        label: v.toString(),
        value: v,
      };
    }),
  },
  {
    name: "T-Shirt",
    values: ["XS", "S", "M", "L", "XL", "XXL"].map((v, i) => {
      return {
        label: v,
        value: i,
      };
    }),
  },
] as const;

function isNumber(v: string | number) {
  return +v - +v < 1;
}

export default function CreateRoomModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const createMutation = api.main.createRoom.useMutation();
  const myTemplates = api.main.getTemplates.useQuery();

  const router = useRouter();

  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([
    "Complexity",
    "Effort",
    "Risk",
  ]);
  const [currentCategory, setCurrentCategory] = useState("");

  const [valueRange, setValueRange] = useState(false);
  const [[min, max], setRange] = useState<[number, number]>([1, 10]);
  const [values, setValues] = useState<Value[]>([]);
  const valuesSorted = useMemo(() => {
    return [...values].sort((a, b) => a.value - b.value);
  }, [values]);
  const [currentValue, setCurrentValue] = useState("");
  const [coffee, setCoffee] = useState(true);
  const [question, setQuestion] = useState(true);
  const [maxMembers, setMaxMembers] = useState(100);

  const [loading, setLoading] = useState(false);

  const [customTemplateModalOpen, setCustomTemplateModalOpen] = useState(false);

  return (
    <HtmlDialog {...props}>
      <div className="modal-box">
        <h3 className="pb-4 text-xl">Create A Room</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Room Name"
          className="input input-bordered w-full"
        />
        <div className="p-2" />
        <div className="flex flex-col gap-4 rounded-md border border-accent p-2">
          <div className="flex flex-wrap gap-2">
            {categories.map((category, i) => {
              return (
                <span
                  key={category}
                  className={cn("badge badge-lg capitalize", {
                    "badge-info": i % 3 === 0,
                    "badge-success": i % 3 === 1,
                    "badge-secondary": i % 3 === 2,
                  })}
                >
                  <button
                    onClick={() => {
                      setCategories(categories.filter((c) => c !== category));
                    }}
                    className="btn btn-circle btn-ghost btn-xs -ml-2"
                  >
                    <MdOutlineClose size={16} />
                  </button>
                  {category}
                </span>
              );
            })}
          </div>
          <input
            type="text"
            value={currentCategory}
            onChange={(e) => {
              setCurrentCategory(e.target.value);
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !categories.includes(currentCategory.toLowerCase())
              ) {
                e.preventDefault();
                e.stopPropagation();
                setCategories([...categories, currentCategory.toLowerCase()]);
                setCurrentCategory("");
              }
            }}
            placeholder="Category"
            className="input input-bordered w-full"
          />
        </div>
        <div className="pt-4">
          <label className="label">
            <span className="label-text">Max users</span>
            <input
              type="number"
              value={maxMembers}
              min={2}
              max={100}
              onChange={(e) => {
                setMaxMembers(parseInt(e.target.value));
              }}
              placeholder="Min"
              className="input input-bordered w-full"
            />
          </label>
        </div>
        <div className="flex flex-col gap-4 pt-4">
          <label className="label cursor-pointer">
            <span className="label-text">Range:</span>
            <input
              type="checkbox"
              checked={valueRange}
              onChange={(e) => {
                setValueRange(e.target.checked);
              }}
              className="checkbox"
            />
          </label>
          {valueRange ? (
            <div className="flex flex-col gap-2 rounded-md border border-accent p-2">
              <input
                type="number"
                value={min}
                min={0}
                max={Math.min(isNumber(max) ? max - 1 : 100, 100)}
                onChange={(e) => {
                  setRange((old) => {
                    return [parseFloat(e.target.value), old[1]];
                  });
                }}
                placeholder="Min"
                className="input input-bordered w-full"
              />
              <input
                type="number"
                value={max}
                max={100}
                min={Math.max(isNumber(min) ? min + 1 : 0, 0)}
                onChange={(e) => {
                  setRange((old) => {
                    return [old[0], parseFloat(e.target.value)];
                  });
                }}
                placeholder="Max"
                className="input input-bordered w-full"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-accent p-2">
              <TemplateModal
                open={customTemplateModalOpen}
                onClose={() => setCustomTemplateModalOpen(false)}
                values={valuesSorted}
              />
              <ADiv className="flex flex-wrap gap-2">
                {valuesSorted.map((value) => {
                  return (
                    <span
                      key={value.label}
                      className="badge badge-outline badge-lg"
                    >
                      <button
                        onClick={() => {
                          setValues(values.filter((v) => v !== value));
                        }}
                        className="btn btn-circle btn-ghost btn-xs -ml-2"
                      >
                        <MdOutlineClose size={16} />
                      </button>
                      {value.label}
                    </span>
                  );
                })}
              </ADiv>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={currentValue}
                  disabled={values.length === 15}
                  onChange={(e) => {
                    setCurrentValue(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !values.find((v) => v.label === currentValue)
                    ) {
                      e.preventDefault();
                      e.stopPropagation();
                      setValues([
                        ...values,
                        {
                          label: currentValue,
                          value: isNumber(currentValue)
                            ? +currentValue
                            : getUnusedValue(values),
                        },
                      ]);
                      setCurrentValue("");
                    }
                  }}
                  placeholder="Value"
                  className={cn("input input-bordered w-full", {
                    "input-error": values.find((v) => v.label === currentValue),
                  })}
                />
                <select
                  className="select select-bordered"
                  onChange={(e) => {
                    const ind = +e.target.value;
                    if (ind >= templates.length) {
                      const template =
                        myTemplates.data?.[ind - templates.length];
                      if (template) {
                        setValues(
                          template.values.map((v) => ({
                            label: v.display,
                            value: v.value.toNumber(),
                          })),
                        );
                      }
                      return;
                    }
                    const template = templates[ind];
                    if (template) {
                      setValues(template.values);
                    }
                  }}
                  defaultValue={-1}
                >
                  <option disabled value={-1}>
                    Choose a template...
                  </option>
                  {templates.map((t, i) => {
                    return (
                      <option key={t.name} value={i}>
                        {t.name}
                      </option>
                    );
                  })}
                  {myTemplates.data?.map((t, i) => {
                    return (
                      <option key={t.name} value={templates.length + i}>
                        {t.name}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setCustomTemplateModalOpen(true);
                  }}
                >
                  Manage custom templates
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-around gap-2">
            Special Values:
            <label className="label cursor-pointer gap-2">
              <span className="label-text">
                <BiCoffee />
              </span>
              <input
                type="checkbox"
                checked={coffee}
                onChange={(e) => {
                  setCoffee(e.target.checked);
                }}
                className="checkbox"
              />
            </label>
            <label className="label cursor-pointer gap-2">
              <span className="label-text">?</span>
              <input
                type="checkbox"
                checked={question}
                onChange={(e) => {
                  setQuestion(e.target.checked);
                }}
                className="checkbox"
              />
            </label>
          </div>
        </div>
        <div className="modal-action">
          <button
            className="btn"
            disabled={
              createMutation.isLoading ||
              loading ||
              name.length === 0 ||
              categories.length === 0 ||
              (valueRange &&
                (!isNumber(min) ||
                  !isNumber(max) ||
                  min < 0 ||
                  max < 0 ||
                  min > max ||
                  max > 100)) ||
              (!valueRange && values.length < 1)
            }
            onClick={() => {
              createMutation.mutate(
                {
                  name,
                  categories,
                  specialInputs: {
                    coffee,
                    question,
                  },
                  maxMembers: Math.min(100, Math.max(2, maxMembers)),
                  inputs: valueRange
                    ? {
                        type: "range",
                        min,
                        max,
                      }
                    : {
                        type: "list",
                        values,
                      },
                },
                {
                  onSuccess: (data) => {
                    setLoading(true);
                    router.push("/room/" + data.slug).catch((e) => {
                      console.error(e);
                    });
                  },
                },
              );
            }}
          >
            {createMutation.isLoading || loading ? (
              <>
                <span className="loading loading-spinner"></span>Creating...
              </>
            ) : (
              "Create"
            )}
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
