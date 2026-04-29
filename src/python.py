# direction
for direction in ('Left', 'Right'):
    for typeof in ('value', 'variable'):
        print(f"get {typeof}{direction}(): string | null {{return this.getAttribute('{typeof}-{direction}');}}")
        print(f"set {typeof}{direction}(value: string | null) {{if (value === null) {{this.removeAttribute" +
              f"('{typeof}-{direction}');}} else this.setAttribute('{typeof}-{direction}', value);}}")
        print()
pass
