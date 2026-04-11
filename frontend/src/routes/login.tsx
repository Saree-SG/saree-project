import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { ArrowRight, Mail, Shield, Wrench } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import type { Body_login_login_access_token as AccessToken } from "@/client"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { PasswordInput } from "@/components/ui/password-input"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { clearSession } from "@/modules/auth/tokenStore"

const formSchema = z.object({
  username: z.email(),
  password: z
    .string()
    .min(1, { message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
}) satisfies z.ZodType<AccessToken>

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      clearSession()
      throw redirect({
        to: "/",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Log In - FastAPI Template",
      },
    ],
  }),
})

function Login() {
  const { loginMutation } = useAuth()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit = (data: FormData) => {
    if (loginMutation.isPending) return
    loginMutation.mutate(data)
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

      <div className="mx-auto grid min-h-dvh w-full max-w-6xl grid-cols-1 px-3 py-6 sm:px-6 sm:py-10 lg:grid-cols-2 lg:gap-10">
        <section className="order-2 mt-6 flex flex-col justify-center gap-5 lg:order-1 lg:mt-0">
          <div className="rounded-2xl border bg-card/70 p-4 backdrop-blur-sm sm:p-6">
            <h2 className="text-lg font-semibold sm:text-xl">Saree ERP</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hệ thống quản trị doanh nghiệp, theo dõi task, project và phân
              quyền tập trung.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <span>Bảo mật đăng nhập theo session và refresh token</span>
              </div>
              <div className="flex items-center gap-2">
                <Wrench className="size-4 text-primary" />
                <span>Tối ưu cho mobile, tablet và desktop</span>
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 flex items-center justify-center lg:order-2">
          <div className="w-full max-w-md rounded-2xl border bg-card/85 p-4 shadow-xl backdrop-blur-sm sm:p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <img
                src="/assets/saree_image/logo_saree.png"
                alt="Saree logo"
                className="h-14 w-auto sm:h-16"
              />
              <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Đăng nhập
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Truy cập hệ thống ERP của công ty bạn
              </p>
            </div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email của bạn</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            data-testid="email-input"
                            placeholder="ten@congty.com"
                            type="email"
                            className="h-11 pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center">
                        <FormLabel>Mật khẩu</FormLabel>
                        <RouterLink
                          to="/recover-password"
                          className="ml-auto text-xs text-primary underline-offset-4 hover:underline sm:text-sm"
                        >
                          Quên mật khẩu?
                        </RouterLink>
                      </div>
                      <FormControl>
                        <PasswordInput
                          data-testid="password-input"
                          placeholder="••••••••"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <LoadingButton
                  type="submit"
                  loading={loginMutation.isPending}
                  className="h-11 w-full"
                >
                  Đăng nhập
                  <ArrowRight className="size-4" />
                </LoadingButton>
              </form>
            </Form>

            <div className="mt-4 text-center text-xs text-muted-foreground sm:text-sm">
              Chưa có tài khoản?{" "}
              <RouterLink
                to="/signup"
                className="text-primary underline-offset-4 hover:underline"
              >
                Đăng ký
              </RouterLink>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
