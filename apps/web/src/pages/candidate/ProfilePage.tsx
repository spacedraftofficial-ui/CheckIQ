import { useEffect, useState } from "react";
import { useFieldArray, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { User, MapPin, GraduationCap, Briefcase, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { Save } from "lucide-react";
import { request, ApiError } from "../../lib/api";
import { InlineError, ErrorState, LoadingBlock } from "../../components/States";
import { updateProfileSchema } from "@checkiq/contracts";

type ProfileForm = z.input<typeof updateProfileSchema>;

/* ---------- shared look (visual only) ---------- */
const cardCls =
  "overflow-hidden rounded-3xl bg-white shadow-md shadow-slate-200/60 ring-1 ring-slate-200";
const labelCls = "mb-1.5 block text-sm font-semibold text-slate-800";
const inputCls =
  "block w-full rounded-xl border-0 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const iconTileCls =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-violet-500/25";
const optionalCls = "font-normal text-slate-500";
const barCls = "h-1.5 bg-gradient-to-r from-blue-600 to-violet-500";

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
  const [contactNumbers, setContactNumbers] = useState("");
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
      className="space-y-6 sm:space-y-8"
      onSubmit={handleSubmit((values) => {
        const customFields = contactNumbers
          ? [{ fieldKey: "contactNumbers", value: contactNumbers }]
          : [];
        void save.mutate({ ...values, customFields });
      })}
      noValidate
    >
      {/* Page header */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-violet-50 px-5 py-8 shadow-sm ring-1 ring-blue-100 sm:px-10 sm:py-10">
        <div className="absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-blue-200/50 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 left-1/4 -z-10 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl" aria-hidden="true" />
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 shadow-lg shadow-blue-500/30">
            <User className="h-7 w-7 text-white" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">My profile</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
              Only the details required for your background verification package are collected.
            </p>
          </div>
        </div>
      </header>

      {/* Personal details */}
      <section className={cardCls}>
        <div className={barCls} aria-hidden="true" />
        <div className="p-5 sm:p-8">
          <div className="flex items-center gap-3">
            <span className={iconTileCls}>
              <User className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">Personal details</h2>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="fullName">
                Full name
              </label>
              <input id="fullName" className={inputCls} {...register("fullName")} />
              <InlineError message={errors.fullName?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor="dateOfBirth">
                Date of birth
              </label>
              <input id="dateOfBirth" type="date" className={inputCls} {...register("dateOfBirth")} />
              <InlineError message={errors.dateOfBirth?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor="gender">
                Gender <span className={optionalCls}>(optional)</span>
              </label>
              <select id="gender" className={inputCls} {...register("gender")}>
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="NON_BINARY">Non-binary</option>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="email">
                Email address
              </label>
              <input id="email" type="email" className={inputCls} {...register("email")} />
              <InlineError message={errors.email?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor="mobile">
                Mobile number
              </label>
              <input id="mobile" className={inputCls} {...register("mobile")} />
              <InlineError message={errors.mobile?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor="pan">
                PAN <span className={optionalCls}>(optional)</span>
              </label>
              <input id="pan" className={inputCls} {...register("pan")} />
              <InlineError message={errors.pan?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor="passportNumber">
                Passport number <span className={optionalCls}>(optional)</span>
              </label>
              <input id="passportNumber" className={inputCls} {...register("passportNumber")} />
            </div>
            <div>
              <label className={labelCls} htmlFor="passportExpiry">
                Passport expiry <span className={optionalCls}>(optional)</span>
              </label>
              <input id="passportExpiry" type="date" className={inputCls} {...register("passportExpiry")} />
              <InlineError message={errors.passportExpiry?.message} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="drivingLicenceNumber">
                Driving licence number <span className={optionalCls}>(optional)</span>
              </label>
              <input id="drivingLicenceNumber" className={inputCls} {...register("drivingLicenceNumber")} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="contactNumbers">
                Contact numbers / references
              </label>
              <textarea
                id="contactNumbers"
                className={`${inputCls} min-h-[80px]`}
                placeholder="Two contact numbers from previous company / college HODs / professors"
                value={contactNumbers}
                onChange={(e) => setContactNumbers(e.target.value)}
              />
              <p className="mt-0.5 text-xs text-slate-500">
                Provide two contact numbers (previous employer, college HOD, or professor) for reference checks.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Repeater
        icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
        title="Addresses"
        description="Your current address is required. Add your permanent address if it is different."
        addLabel="Add an address"
        render={(index) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor={"address-type-" + index}>
                Type
              </label>
              <select
                id={"address-type-" + index}
                className={inputCls}
                {...register(`addresses.${index}.type` as const)}
              >
                <option value="CURRENT">Current</option>
                <option value="PERMANENT">Permanent</option>
                <option value="OTHER">Other</option>
              </select>
              <InlineError message={errors.addresses?.[index]?.type?.message} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor={"address-line1-" + index}>
                Address line 1
              </label>
              <input
                id={"address-line1-" + index}
                className={inputCls}
                {...register(`addresses.${index}.line1` as const)}
              />
              <InlineError message={errors.addresses?.[index]?.line1?.message} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor={"address-line2-" + index}>
                Address line 2 <span className={optionalCls}>(optional)</span>
              </label>
              <input
                id={"address-line2-" + index}
                className={inputCls}
                {...register(`addresses.${index}.line2` as const)}
              />
              <InlineError message={errors.addresses?.[index]?.line2?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"address-city-" + index}>
                City
              </label>
              <input
                id={"address-city-" + index}
                className={inputCls}
                {...register(`addresses.${index}.city` as const)}
              />
              <InlineError message={errors.addresses?.[index]?.city?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"address-state-" + index}>
                State
              </label>
              <input
                id={"address-state-" + index}
                className={inputCls}
                {...register(`addresses.${index}.state` as const)}
              />
              <InlineError message={errors.addresses?.[index]?.state?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"address-country-" + index}>
                Country
              </label>
              <input
                id={"address-country-" + index}
                className={inputCls}
                {...register(`addresses.${index}.country` as const)}
              />
              <InlineError message={errors.addresses?.[index]?.country?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"address-postal-" + index}>
                Postal code
              </label>
              <input
                id={"address-postal-" + index}
                className={inputCls}
                {...register(`addresses.${index}.postalCode` as const)}
              />
              <InlineError message={errors.addresses?.[index]?.postalCode?.message} />
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
        icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
        title="Education"
        description="Add the qualifications the verification team needs to confirm."
        addLabel="Add a qualification"
        render={(index) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor={"edu-qualification-" + index}>
                Qualification
              </label>
              <input
                id={"edu-qualification-" + index}
                className={inputCls}
                {...register(`education.${index}.qualification` as const)}
              />
              <InlineError message={errors.education?.[index]?.qualification?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"edu-institution-" + index}>
                Institution
              </label>
              <input
                id={"edu-institution-" + index}
                className={inputCls}
                {...register(`education.${index}.institution` as const)}
              />
              <InlineError message={errors.education?.[index]?.institution?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"edu-board-" + index}>
                University / board
              </label>
              <input
                id={"edu-board-" + index}
                className={inputCls}
                {...register(`education.${index}.universityOrBoard` as const)}
              />
              <InlineError message={errors.education?.[index]?.universityOrBoard?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"edu-registration-" + index}>
                Registration number
              </label>
              <input
                id={"edu-registration-" + index}
                className={inputCls}
                {...register(`education.${index}.registrationNumber` as const)}
              />
              <InlineError message={errors.education?.[index]?.registrationNumber?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"edu-year-" + index}>
                Year of passing
              </label>
              <input
                id={"edu-year-" + index}
                type="number"
                className={inputCls}
                {...register(`education.${index}.yearOfPassing` as const, { valueAsNumber: true })}
              />
              <InlineError message={errors.education?.[index]?.yearOfPassing?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"edu-score-" + index}>
                Score / percentage
              </label>
              <input
                id={"edu-score-" + index}
                className={inputCls}
                {...register(`education.${index}.scoreOrPercentage` as const)}
              />
              <InlineError message={errors.education?.[index]?.scoreOrPercentage?.message} />
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
        icon={<Briefcase className="h-5 w-5" aria-hidden="true" />}
        title="Employment history"
        description="Add each employer the verification team should confirm."
        addLabel="Add an employer"
        render={(index) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor={"emp-employer-" + index}>
                Employer
              </label>
              <input
                id={"emp-employer-" + index}
                className={inputCls}
                {...register(`employments.${index}.employer` as const)}
              />
              <InlineError message={errors.employments?.[index]?.employer?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"emp-designation-" + index}>
                Designation
              </label>
              <input
                id={"emp-designation-" + index}
                className={inputCls}
                {...register(`employments.${index}.designation` as const)}
              />
              <InlineError message={errors.employments?.[index]?.designation?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"emp-id-" + index}>
                Employee ID
              </label>
              <input
                id={"emp-id-" + index}
                className={inputCls}
                {...register(`employments.${index}.employeeId` as const)}
              />
              <InlineError message={errors.employments?.[index]?.employeeId?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"emp-from-" + index}>
                From
              </label>
              <input
                id={"emp-from-" + index}
                type="date"
                className={inputCls}
                {...register(`employments.${index}.fromDate` as const)}
              />
              <InlineError message={errors.employments?.[index]?.fromDate?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"emp-to-" + index}>
                To
              </label>
              <input
                id={"emp-to-" + index}
                type="date"
                className={inputCls}
                {...register(`employments.${index}.toDate` as const)}
              />
              <InlineError message={errors.employments?.[index]?.toDate?.message} />
            </div>
            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-200 transition hover:bg-white hover:ring-slate-300 has-[:checked]:bg-blue-50 has-[:checked]:ring-blue-400">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                  {...register(`employments.${index}.isCurrent` as const)}
                />
                I currently work here
              </label>
              <InlineError message={errors.employments?.[index]?.isCurrent?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"emp-contact-name-" + index}>
                Contact name
              </label>
              <input
                id={"emp-contact-name-" + index}
                className={inputCls}
                {...register(`employments.${index}.contactName` as const)}
              />
              <InlineError message={errors.employments?.[index]?.contactName?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"emp-contact-email-" + index}>
                Contact email
              </label>
              <input
                id={"emp-contact-email-" + index}
                type="email"
                className={inputCls}
                {...register(`employments.${index}.contactEmail` as const)}
              />
              <InlineError message={errors.employments?.[index]?.contactEmail?.message} />
            </div>
            <div>
              <label className={labelCls} htmlFor={"emp-contact-mobile-" + index}>
                Contact mobile
              </label>
              <input
                id={"emp-contact-mobile-" + index}
                className={inputCls}
                {...register(`employments.${index}.contactMobile` as const)}
              />
              <InlineError message={errors.employments?.[index]?.contactMobile?.message} />
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
        <div
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            {save.error instanceof ApiError
              ? save.error.message
              : "We could not save your profile. Please try again."}
          </span>
        </div>
      ) : null}

      {save.isSuccess ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>Your profile has been saved.</span>
        </div>
      ) : null}

      <div className="sticky bottom-4 z-20 flex items-center justify-end gap-3 rounded-2xl bg-white/90 p-3 shadow-xl shadow-blue-200/50 ring-1 ring-blue-100 backdrop-blur-md">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none sm:w-auto"
          disabled={isSubmitting || save.isPending}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting || save.isPending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

function Repeater({
  icon,
  title,
  description,
  addLabel,
  render,
  control,
  name,
  emptyItem,
}: {
  icon: React.ReactNode;
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
    <section className={cardCls}>
      <div className={barCls} aria-hidden="true" />
      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className={iconTileCls}>{icon}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <p className="mt-0.5 max-w-xl text-sm leading-relaxed text-slate-500">{description}</p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 transition hover:bg-gradient-to-r hover:from-blue-600 hover:to-violet-500 hover:text-white hover:ring-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            onClick={() => append(emptyItem as never)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {addLabel}
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nothing added yet.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="relative overflow-hidden rounded-2xl bg-slate-50/70 p-5 pt-14 ring-1 ring-inset ring-slate-200 transition hover:bg-white hover:shadow-md sm:p-6 sm:pt-14"
              >
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-600 to-violet-500" aria-hidden="true" />
                <span
                  className="absolute left-5 top-4 flex h-7 min-w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-500 px-2 text-xs font-bold tabular-nums text-white shadow-sm sm:left-6"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                {render(index)}
                <button
                  type="button"
                  className="absolute right-4 top-3.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove {title.toLowerCase().replace(/s$/, "")} {index + 1}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}