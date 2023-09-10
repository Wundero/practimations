import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useState } from "react";
import { useRouter } from "next/router";
import { cn } from "~/utils/cn";
import { MdOutlineClose } from "react-icons/md";

export default function CreateRoomModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const createMutation = api.main.createRoom.useMutation();

  const router = useRouter();

  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([
    "Complexity",
    "Effort",
    "Risk"
  ]);
  const [currentCategory, setCurrentCategory] = useState("");

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
        <div className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((category, i) => {
              return (
                <span
                  key={category}
                  className={cn("badge capitalize badge-lg", {
                    "badge-info": i % 3 === 0,
                    "badge-success": i % 3 === 1,
                    'badge-secondary': i % 3 === 2,
                  })}
                >
                  <button
                    onClick={() => {
                      setCategories(categories.filter((c) => c !== category));
                    }}
                    className="btn btn-circle btn-ghost btn-xs -ml-2"
                  >
                    <MdOutlineClose size={16}/>
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
        <div className="modal-action">
          <button
            className="btn"
            disabled={createMutation.isLoading || name.length === 0 || categories.length === 0}
            onClick={() => {
              createMutation.mutate(
                {
                  name,
                  categories,
                },
                {
                  onSuccess: (data) => {
                    router.push("/room/" + data.slug).catch((e) => {
                      console.error(e);
                    });
                  },
                },
              );
            }}
          >
            {createMutation.isLoading ? (
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
