import { useEffect } from "react";
import { useFieldArray, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Save } from "lucide-react";
import { request, ApiError } from "../../lib/api";
import { InlineError, ErrorState, LoadingBlock } from "../../components/States";
import { updateProfileSchema } from "@checkiq/contracts";

type ProfileForm = z.input<typeof updateProfileSchema>;

interface ProfileResponse {
  candidateId: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string;
  mobile: string;
  pan: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  drivingLicenceNumber: string | null;
  addresses: { id?: string; type: string; line1: string; line2?: string | null; city: string; state: string; country: string; postalCode?: string | null }[];
  education: { id?: string; qualification: string; institution: string; universityOrBoard?: string | null; registrationNumber?: string | null; yearOfPassing: number; scoreOrPercentage?: string | null }[];
    employments: { id?: string; employer: string; designation: string; employeeId?: string | null; fromDate: string; toDate?: string | null; isCurrent: boolean; contactName?: string | null; contactEmail?: string | null; contactMobile?: string | null }[];
  profileCompleted: boolean;
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["candidate", "profile"],
    queryFn: () => request<ProfileResponse>("/profile"),
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      addresses: [],
      education: [],
      employments: [],
    },
  });

  useEffect(() => {
    if (!query.data) return;
    reset({
      fullName: query.data.fullName,
      dateOfBirth: query.data.dateOfBirth ?? "",
     gender: (query.data.gender ?? "") as ProfileForm["gender"],
      email: query.data.email,
      mobile: query.data.mobile,
       pan: query.data.pan ?? "",
      passportNumber: query.data.passportNumber ?? "",
      passportExpiry: query.data.passportExpiry ?? "",
      drivingLicenceNumber: query.data.drivingLicenceNumber ?? "",
      addresses: query.data.addresses.map((a) => ({
        id: a.id,
        type: a.type as "CURRENT" | "PERMANENT" | "OTHER",
        line1: a.line1,
        line2: a.line2 ?? "",
        city: a.city,
        state: a.state,
        country: a.country,
        postalCode: a.postalCode ?? "",
      })),
      education: query.data.education.map((e) => ({
        id: e.id,
        qualification: e.qualification,
        institution: e.institution,
        universityOrBoard: e.universityOrBoard ?? "",
        registrationNumber: e.registrationNumber ?? "",
        yearOfPassing: e.yearOfPassing,
        scoreOrPercentage: e.scoreOrPercentage ?? "",
      })),
      employments: query.data.employments.map((e) => ({
        id: e.id,
        employer: e.employer,
        designation: e.designation,
        employeeId: e.employeeId ?? "",
        fromDate: e.fromDate ?? "",
        toDate: e.toDate ?? "",
        isCurrent: e.isCurrent,
        contactName: e.contactName ?? "",
        contactEmail: e.contactEmail ?? "",
        contactMobile: e.contactMobile ?? "",
      })),
    });
  }, [query.data, reset]);

  const save = useMutation({
    mutationFn: (values: ProfileForm) =>
      request<ProfileResponse>("/profile", { method: "PUT", body: values }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["candidate"] });
    },
  });

  if (query.isLoading) return <LoadingBlock label="Loading your profile" />;
  if (query.isError) {
    return (
      <ErrorState
        title="We could not load your profile"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit((values) => save.mutate(values))}
      noValidate
    >
      <header>
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">My profile</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Only the details required for your background verification package are collected.
        </p>
      </header>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Personal details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fullName">
              Full name
            </label>
            <input id="fullName" className="input" {...register("fullName")} />
            <InlineError message={errors.fullName?.message} />
          </div>
          <div>
            <label className="label" htmlFor="dateOfBirth">
              Date of birth
            </label>
            <input id="dateOfBirth" type="date" className="input" {...register("dateOfBirth")} />
            <InlineError message={errors.dateOfBirth?.message} />
          </div>
          <div>
            <label className="label" htmlFor="gender">
              Gender <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <select id="gender" className="input" {...register("gender")}>
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="NON_BINARY">Non-binary</option>
              <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="email">
              Email address
            </label>
            <input id="email" type="email" className="input" {...register("email")} />
            <InlineError message={errors.email?.message} />
          </div>
          <div>
            <label className="label" htmlFor="mobile">
              Mobile number
            </label>
            <input id="mobile" className="input" {...register("mobile")} />
            <InlineError message={errors.mobile?.message} />
          </div>
          <div>
            <label className="label" htmlFor="pan">
              PAN <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <input id="pan" className="input" {...register("pan")} />
            <InlineError message={errors.pan?.message} />
          </div>
          <div>
            <label className="label" htmlFor="passportNumber">
              Passport number <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <input id="passportNumber" className="input" {...register("passportNumber")} />
          </div>
          <div>
            <label className="label" htmlFor="passportExpiry">
              Passport expiry <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <input id="passportExpiry" type="date" className="input" {...register("passportExpiry")} />
            <InlineError message={errors.passportExpiry?.message} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="drivingLicenceNumber">
              Driving licence number <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <input id="drivingLicenceNumber" className="input" {...register("drivingLicenceNumber")} />
          </div>
        </div>
      </section>

      <Repeater
        title="Addresses"
        description="Your current address is required. Add your permanent address if it is different."
        addLabel="Add an address"
        render={(index) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={"address-type-" + index}>
                Type
              </label>
              <select
                id={"address-type-" + index}
                className="input"
                {...register(`addresses.${index}.type` as const)}
              >
                <option value="CURRENT">Current</option>
                <option value="PERMANENT">Permanent</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={"address-line1-" + index}>
                Address line 1
              </label>
              <input
                id={"address-line1-" + index}
                className="input"
                {...register(`addresses.${index}.line1` as const)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={"address-line2-" + index}>
                Address line 2 <span className="font-normal text-ink-500">(optional)</span>
              </label>
              <input
                id={"address-line2-" + index}
                className="input"
                {...register(`addresses.${index}.line2` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"address-city-" + index}>
                City
              </label>
              <input
                id={"address-city-" + index}
                className="input"
                {...register(`addresses.${index}.city` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"address-state-" + index}>
                State
              </label>
              <input
                id={"address-state-" + index}
                className="input"
                {...register(`addresses.${index}.state` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"address-country-" + index}>
                Country
              </label>
              <input
                id={"address-country-" + index}
                className="input"
                {...register(`addresses.${index}.country` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"address-postal-" + index}>
                Postal code
              </label>
              <input
                id={"address-postal-" + index}
                className="input"
                {...register(`addresses.${index}.postalCode` as const)}
              />
            </div>
          </div>
        )}
        control={control}
        name="addresses"
        emptyItem={{
          type: "CURRENT",
          line1: "",
          line2: "",
          city: "",
          state: "",
          country: "",
          postalCode: "",
        }}
      />

      <Repeater
        title="Education"
        description="Add the qualifications the verification team needs to confirm."
        addLabel="Add a qualification"
        render={(index) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={"edu-qualification-" + index}>
                Qualification
              </label>
              <input
                id={"edu-qualification-" + index}
                className="input"
                {...register(`education.${index}.qualification` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"edu-institution-" + index}>
                Institution
              </label>
              <input
                id={"edu-institution-" + index}
                className="input"
                {...register(`education.${index}.institution` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"edu-board-" + index}>
                University / board
              </label>
              <input
                id={"edu-board-" + index}
                className="input"
                {...register(`education.${index}.universityOrBoard` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"edu-registration-" + index}>
                Registration number
              </label>
              <input
                id={"edu-registration-" + index}
                className="input"
                {...register(`education.${index}.registrationNumber` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"edu-year-" + index}>
                Year of passing
              </label>
              <input
                id={"edu-year-" + index}
                type="number"
                className="input"
                {...register(`education.${index}.yearOfPassing` as const, { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="label" htmlFor={"edu-score-" + index}>
                Score / percentage
              </label>
              <input
                id={"edu-score-" + index}
                className="input"
                {...register(`education.${index}.scoreOrPercentage` as const)}
              />
            </div>
          </div>
        )}
        control={control}
        name="education"
        emptyItem={{
          qualification: "",
          institution: "",
          universityOrBoard: "",
          registrationNumber: "",
          yearOfPassing: new Date().getFullYear(),
          scoreOrPercentage: "",
        }}
      />

      <Repeater
        title="Employment history"
        description="Add each employer the verification team should confirm."
        addLabel="Add an employer"
        render={(index) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={"emp-employer-" + index}>
                Employer
              </label>
              <input
                id={"emp-employer-" + index}
                className="input"
                {...register(`employments.${index}.employer` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"emp-designation-" + index}>
                Designation
              </label>
              <input
                id={"emp-designation-" + index}
                className="input"
                {...register(`employments.${index}.designation` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"emp-id-" + index}>
                Employee ID
              </label>
              <input
                id={"emp-id-" + index}
                className="input"
                {...register(`employments.${index}.employeeId` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"emp-from-" + index}>
                From
              </label>
              <input
                id={"emp-from-" + index}
                type="date"
                className="input"
                {...register(`employments.${index}.fromDate` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"emp-to-" + index}>
                To
              </label>
              <input
                id={"emp-to-" + index}
                type="date"
                className="input"
                {...register(`employments.${index}.toDate` as const)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300"
                  {...register(`employments.${index}.isCurrent` as const)}
                />
                I currently work here
              </label>
            </div>
            <div>
              <label className="label" htmlFor={"emp-contact-name-" + index}>
                Contact name
              </label>
              <input
                id={"emp-contact-name-" + index}
                className="input"
                {...register(`employments.${index}.contactName` as const)}
              />
            </div>
            <div>
              <label className="label" htmlFor={"emp-contact-email-" + index}>
                Contact email
              </label>
              <input
                id={"emp-contact-email-" + index}
                type="email"
                className="input"
                {...register(`employments.${index}.contactEmail` as const)}
              />
            </div>
          </div>
        )}
        control={control}
        name="employments"
        emptyItem={{
          employer: "",
          designation: "",
          employeeId: "",
          fromDate: "",
          toDate: "",
          isCurrent: false,
          contactName: "",
          contactEmail: "",
          contactMobile: "",
        }}
      />

      {save.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {save.error instanceof ApiError
            ? save.error.message
            : "We could not save your profile. Please try again."}
        </div>
      ) : null}

      {save.isSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Your profile has been saved.
        </div>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={isSubmitting || save.isPending}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting || save.isPending ? "Savingâ€¦" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

function Repeater({
  title,
  description,
  addLabel,
  render,
  control,
  name,
  emptyItem,
}: {
  title: string;
  description: string;
  addLabel: string;
  render: (index: number) => React.ReactNode;
  control: Control<ProfileForm>;
  name: "addresses" | "education" | "employments";
  emptyItem: Record<string, unknown>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <p className="mt-1 text-sm text-ink-500">{description}</p>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => append(emptyItem as never)}
        >
          {addLabel}
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">Nothing added yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {fields.map((field, index) => (
            <div key={field.id}>
              {render(index)}
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-red-700 underline"
                onClick={() => remove(index)}
              >
                Remove {title.toLowerCase().replace(/s$/, "")} {index + 1}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

